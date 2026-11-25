import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";
import PrintToolbar from "@/components/print/PrintToolbar";
import { OfficialHeader, SignaturesFooter } from "@/components/print/OfficialHeader";
import { loadPrintSettings, thresholdsOf } from "@/components/print/settings";
import {
  computeGroupTotal,
  getRating,
  normalizeItems,
  round2,
  toArabicDigits,
} from "@/lib/grades";
import { GROUP_LABEL, SEMESTER_LABEL, toGroup } from "@/lib/constants";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";

type SubjectInfo = {
  id: number;
  name: string;
  total_max: string;
  passing_score: string;
  items: ScoreItem[];
};

type StudentInfo = {
  id: number;
  full_name: string;
  national_id: string | null;
  class_number: number | null;
};

type GradeInfo = {
  student_id: number;
  subject_id: number;
  values: GradeValues | null;
  total: string | null;
};

type ClassRow = {
  id: number;
  full_name: string;
  national_id: string | null;
  class_number: number | null;
};

/**
 * =====================================================================
 *  ملخص الفصل الدراسي (الأول / الثاني)
 *  كشف واحد يجمع جميع مواد الفصل: لكل طالب درجة كل مادة + المجموع
 *  + النسبة + المتوسط + التقدير + الترتيب، مع إحصاءات عامة.
 * =====================================================================
 */
export default async function PrintSemesterPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string; semester?: string }>;
}) {
  const params = await searchParams;
  const classroomId = Number(params.classroomId);
  const semester = params.semester === "second" ? "second" : "first";

  const session = await getSession();
  if (!session) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center">
        <p className="text-lg font-bold text-slate-700">الجلسة منتهية</p>
        <p className="mt-2 text-sm text-slate-500">سجّل الدخول من جديد ثم أعد فتح صفحة الطباعة.</p>
      </div>
    );
  }

  await ensureDatabase().catch(() => undefined);

  if (!Number.isFinite(classroomId) || classroomId <= 0) {
    return (
      <>
        <PrintToolbar title="ملخص الفصل الدراسي" autoPrint={false} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">لم يتم تحديد فصل دراسي</p>
          <p className="mt-2 text-sm text-slate-500">ارجع إلى صفحة التقارير واختر الفصل.</p>
        </div>
      </>
    );
  }

  if (!(await ownsClassroom(classroomId, session.uid))) {
    return (
      <>
        <PrintToolbar title="ملخص الفصل الدراسي" autoPrint={false} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">غير مصرح بعرض هذا الملخص</p>
          <p className="mt-2 text-sm text-slate-500">هذا الفصل ليس من فصولك.</p>
        </div>
      </>
    );
  }

  const settings = await loadPrintSettings(session.uid);
  const ratingThresholds = thresholdsOf(settings);

  /* ------------------------- بيانات الفصل ------------------------- */
  const classroomResult = await db.execute<{ grade: string; section: string; stage: string }>(
    sql`SELECT grade, section, stage FROM classrooms WHERE id = ${classroomId} LIMIT 1`,
  );
  const classroom = classroomResult.rows?.[0];

  if (!classroom) {
    return (
      <>
        <PrintToolbar title="ملخص الفصل الدراسي" autoPrint={false} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">الفصل غير موجود</p>
        </div>
      </>
    );
  }

  /* --------------------------- المواد --------------------------- */
  const subjectsResult = await db.execute<SubjectInfo>(sql`
    SELECT s.id, s.name, s.total_max, s.passing_score, s.items
    FROM subjects s
    WHERE s.classroom_id = ${classroomId} AND s.user_id = ${session.uid}
    ORDER BY s.name
  `);
  const subjects = (subjectsResult.rows ?? []).map((s) => ({
    ...s,
    items: normalizeItems(s.items ?? []),
  }));

  /* --------------------------- الطلاب --------------------------- */
  const studentsResult = await db.execute<StudentInfo>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number
    FROM students st
    WHERE st.classroom_id = ${classroomId} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);
  const students = studentsResult.rows ?? [];

  /* -------------------------- الدرجات -------------------------- */
  const gradesResult = await db.execute<GradeInfo>(sql`
    SELECT g.student_id, g.subject_id, g.values, g.total
    FROM grades g
    WHERE g.semester = ${semester}
      AND g.subject_id IN (
        SELECT s.id FROM subjects s
        WHERE s.classroom_id = ${classroomId} AND s.user_id = ${session.uid}
      )
  `);

  const gradeMap = new Map<string, { values: GradeValues; total: number }>();
  for (const g of gradesResult.rows ?? []) {
    gradeMap.set(`${g.student_id}:${g.subject_id}`, {
      values: (g.values ?? {}) as GradeValues,
      total: Number(g.total ?? 0),
    });
  }

  /* --------------------- بناء صفوف الملخص --------------------- */
  type RowOut = {
    id: number;
    fullName: string;
    nationalId: string | null;
    classNumber: number | null;
    perSubject: Record<number, number>;
    grandTotal: number;
    maxPossible: number;
    pct: number;
    average: number;
    ratingLabel: string;
    ratingColor: string;
    passed: boolean;
    gradedCount: number;
  };

  const rows: RowOut[] = students.map((student) => {
    const perSubject: Record<number, number> = {};
    let grandTotal = 0;
    let maxPossible = 0;
    let gradedCount = 0;

    for (const subject of subjects) {
      const entry = gradeMap.get(`${student.id}:${subject.id}`);
      const total = entry?.total ?? 0;
      perSubject[subject.id] = total;
      if (total > 0) {
        grandTotal += total;
        maxPossible += Number(subject.total_max);
        gradedCount += 1;
      }
    }

    const pct = maxPossible > 0 ? (grandTotal / maxPossible) * 100 : 0;
    const average = gradedCount > 0 ? round2(grandTotal / gradedCount) : 0;
    // درجة النجاح المركّبة: نصف مجموع العظمى للمواد المرصدة
    const passing = round2(maxPossible / 2);
    const rating = getRating(grandTotal, maxPossible, passing, ratingThresholds);

    return {
      id: student.id,
      fullName: student.full_name,
      nationalId: student.national_id,
      classNumber: student.class_number,
      perSubject,
      grandTotal: round2(grandTotal),
      maxPossible: round2(maxPossible),
      pct,
      average,
      ratingLabel: rating.label,
      ratingColor: rating.color,
      passed: rating.passed,
      gradedCount,
    };
  });

  /* --------------------------- الترتيب --------------------------- */
  const sorted = [...rows].sort((a, b) => b.grandTotal - a.grandTotal);
  const rankOf = new Map<number, number>();
  let lastTotal: number | null = null;
  let lastRank = 0;
  sorted.forEach((row, index) => {
    if (lastTotal !== null && row.grandTotal === lastTotal) {
      rankOf.set(row.id, lastRank);
    } else {
      rankOf.set(row.id, index + 1);
      lastRank = index + 1;
      lastTotal = row.grandTotal;
    }
  });

  /* -------------------------- الإحصاءات -------------------------- */
  const count = rows.length;
  const subjectsCount = subjects.length;
  const totalMaxAll = round2(subjects.reduce((s, x) => s + Number(x.total_max), 0));

  const gradedRows = rows.filter((r) => r.gradedCount > 0);
  const avgOf = (pick: (r: RowOut) => number) =>
    gradedRows.length ? round2(gradedRows.reduce((s, r) => s + pick(r), 0) / gradedRows.length) : 0;

  const statsAvgTotal = avgOf((r) => r.grandTotal);
  const statsAvgPct = avgOf((r) => r.pct);
  const statsAvgMean = avgOf((r) => r.average);
  const highest = gradedRows.length ? Math.max(...gradedRows.map((r) => r.grandTotal)) : 0;
  const lowest = gradedRows.length ? Math.min(...gradedRows.map((r) => r.grandTotal)) : 0;

  const passedCount = rows.filter((r) => r.gradedCount > 0 && r.passed).length;
  const failedCount = rows.filter((r) => r.gradedCount > 0 && !r.passed).length;

  // متوسط كل مادة على مستوى الصف
  const subjectClassAvg = new Map<number, number>();
  for (const subject of subjects) {
    const values = rows.map((r) => r.perSubject[subject.id] ?? 0).filter((v) => v > 0);
    subjectClassAvg.set(
      subject.id,
      values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    );
  }

  const noData = subjects.length === 0 || students.length === 0;

  return (
    <>
      <PrintToolbar
        title={`ملخص ${SEMESTER_LABEL[semester]} — الصف ${classroom.grade} ${classroom.section}`}
        supportsNid={false}
      />

      <div className="print-area print-page rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <OfficialHeader
          settings={settings}
          title={`ملخص ${SEMESTER_LABEL[semester]}`}
          meta={
            <span>
              الصف {classroom.grade} — الشعبة {classroom.section} · المرحلة {classroom.stage} · عدد
              الطلاب {toArabicDigits(count)} · عدد المواد {toArabicDigits(subjectsCount)}
            </span>
          }
        />

        {noData ? (
          <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-10 text-center text-[11pt] font-bold text-slate-600">
            {subjects.length === 0
              ? "لا توجد مواد مرتبطة بهذا الفصل — أضف مواداً واربطها بالفصل أولاً."
              : "لا يوجد طلاب في هذا الفصل."}
          </div>
        ) : (
          <>
            {/* ملخص إحصائي */}
            <div className="avoid-break mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { label: "عدد الطلاب", value: toArabicDigits(count) },
                { label: "عدد المواد", value: toArabicDigits(subjectsCount) },
                { label: "المجموع الممكن", value: toArabicDigits(totalMaxAll) },
                { label: "متوسط المجموع", value: toArabicDigits(statsAvgTotal) },
                { label: "النسبة العامة", value: `${toArabicDigits(Math.round(statsAvgPct))}%` },
                { label: "المتوسط العام", value: toArabicDigits(statsAvgMean) },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-lg border border-slate-400 bg-slate-50 p-2 text-center"
                >
                  <p className="text-[8pt] font-bold text-slate-600">{card.label}</p>
                  <p className="text-[12pt] font-extrabold tabular-nums text-slate-900">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* جدول الملخص */}
            <table className="w-full border-collapse text-center text-[9.5pt]">
              <thead>
                <tr className="bg-slate-100 font-extrabold">
                  <th className="border border-slate-500 px-1 py-1.5">م</th>
                  <th className="border border-slate-500 px-2 py-1.5 text-right">اسم الطالب</th>
                  {subjects.map((subject) => (
                    <th key={subject.id} className="border border-slate-500 px-1 py-1.5">
                      <span className="block max-w-24 truncate">{subject.name}</span>
                      <span className="text-[8pt] font-normal text-slate-500">
                        ({toArabicDigits(Number(subject.total_max))})
                      </span>
                    </th>
                  ))}
                  <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">المجموع</th>
                  <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">%</th>
                  <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">المتوسط</th>
                  <th className="border border-slate-500 px-1 py-1.5">التقدير</th>
                  <th className="border border-slate-500 px-1 py-1.5">الترتيب</th>
                  <th className="border border-slate-500 px-1 py-1.5">النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="avoid-break">
                    <td className="border border-slate-400 px-1 py-1 tabular-nums">
                      {toArabicDigits(row.classNumber ?? index + 1)}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 text-right font-semibold">
                      {row.fullName}
                    </td>
                    {subjects.map((subject) => {
                      const value = row.perSubject[subject.id] ?? 0;
                      const passing = Number(subject.passing_score);
                      return (
                        <td
                          key={subject.id}
                          className={`border border-slate-400 px-1 py-1 tabular-nums ${
                            value === 0
                              ? "text-slate-400"
                              : value < passing
                                ? "font-bold text-rose-700"
                                : "font-bold"
                          }`}
                        >
                          {value > 0 ? toArabicDigits(value) : "—"}
                        </td>
                      );
                    })}
                    <td className="border border-slate-400 bg-slate-50 px-1 py-1 font-extrabold tabular-nums">
                      {row.gradedCount > 0 ? toArabicDigits(row.grandTotal) : "—"}
                    </td>
                    <td className="border border-slate-400 bg-slate-50 px-1 py-1 tabular-nums">
                      {row.gradedCount > 0 ? `${toArabicDigits(Math.round(row.pct))}%` : "—"}
                    </td>
                    <td className="border border-slate-400 bg-slate-50 px-1 py-1 tabular-nums">
                      {row.gradedCount > 0 ? toArabicDigits(row.average) : "—"}
                    </td>
                    <td className="border border-slate-400 px-1 py-1">
                      {row.gradedCount > 0 ? row.ratingLabel : "—"}
                    </td>
                    <td className="border border-slate-400 px-1 py-1 font-extrabold tabular-nums">
                      {row.gradedCount > 0 ? toArabicDigits(rankOf.get(row.id) ?? "—") : "—"}
                    </td>
                    <td
                      className={`border border-slate-400 px-1 py-1 font-bold ${
                        row.gradedCount === 0
                          ? ""
                          : row.passed
                            ? "text-emerald-700"
                            : "text-rose-700"
                      }`}
                    >
                      {row.gradedCount === 0 ? "—" : row.passed ? "ناجح" : "راسب"}
                    </td>
                  </tr>
                ))}

                {/* متوسط الصف لكل مادة */}
                <tr className="bg-slate-100 font-extrabold">
                  <td colSpan={2} className="border border-slate-500 px-2 py-1.5 text-right">
                    متوسط الصف
                  </td>
                  {subjects.map((subject) => (
                    <td key={subject.id} className="border border-slate-500 px-1 py-1.5 tabular-nums">
                      {toArabicDigits(subjectClassAvg.get(subject.id) ?? 0)}
                    </td>
                  ))}
                  <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                    {toArabicDigits(statsAvgTotal)}
                  </td>
                  <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                    {toArabicDigits(Math.round(statsAvgPct))}%
                  </td>
                  <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                    {toArabicDigits(statsAvgMean)}
                  </td>
                  <td colSpan={3} className="border border-slate-500 px-1 py-1.5">
                    ناجح: {toArabicDigits(passedCount)} · راسب: {toArabicDigits(failedCount)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* توزيع المواد حسب المجموعات */}
            <div className="avoid-break mt-5">
              <p className="mb-2 text-[10.5pt] font-extrabold text-slate-800">
                توزيع درجات المواد — المهام الأدائية (٤٠) والتقويمات التحريرية (٦٠)
              </p>
              <table className="w-full border-collapse text-center text-[9.5pt]">
                <thead>
                  <tr className="bg-slate-100 font-extrabold">
                    <th className="border border-slate-500 px-2 py-1.5 text-right">المادة</th>
                    <th className="border border-slate-500 bg-sky-100 px-1 py-1.5">
                      المهام الأدائية
                    </th>
                    <th className="border border-slate-500 bg-violet-100 px-1 py-1.5">
                      التقويمات التحريرية
                    </th>
                    <th className="border border-slate-500 px-1 py-1.5">مجموع المادة</th>
                    <th className="border border-slate-500 px-1 py-1.5">درجة النجاح</th>
                    <th className="border border-slate-500 px-1 py-1.5">متوسط الصف</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => {
                    const perfMax = computeGroupTotal(subject.items, {}, "performance").max;
                    const writMax = computeGroupTotal(subject.items, {}, "written").max;
                    return (
                      <tr key={subject.id}>
                        <td className="border border-slate-400 px-2 py-1 text-right font-semibold">
                          {subject.name}
                        </td>
                        <td className="border border-slate-400 bg-sky-50 px-1 py-1 tabular-nums">
                          {toArabicDigits(perfMax)}
                        </td>
                        <td className="border border-slate-400 bg-violet-50 px-1 py-1 tabular-nums">
                          {toArabicDigits(writMax)}
                        </td>
                        <td className="border border-slate-400 px-1 py-1 font-extrabold tabular-nums">
                          {toArabicDigits(Number(subject.total_max))}
                        </td>
                        <td className="border border-slate-400 px-1 py-1 tabular-nums">
                          {toArabicDigits(Number(subject.passing_score))}
                        </td>
                        <td className="border border-slate-400 px-1 py-1 tabular-nums">
                          {toArabicDigits(subjectClassAvg.get(subject.id) ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* أعلى وأدنى */}
            <div className="avoid-break mt-4 flex flex-wrap justify-center gap-3 text-[9.5pt] font-bold text-slate-700">
              <span className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-1.5">
                أعلى مجموع: {toArabicDigits(highest)}
              </span>
              <span className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-1.5">
                أدنى مجموع: {toArabicDigits(lowest)}
              </span>
              <span className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-1.5">
                عدد الناجحين: {toArabicDigits(passedCount)}
              </span>
              <span className="rounded-lg border border-slate-400 bg-slate-50 px-3 py-1.5">
                عدد الراسبين: {toArabicDigits(failedCount)}
              </span>
            </div>
          </>
        )}

        <SignaturesFooter
          teacherName={settings.teacherName}
          headmasterName={settings.headmasterName}
          teacherSignature={settings.teacherSignature}
          headmasterSignature={settings.headmasterSignature}
          note={`يشمل هذا الملخص جميع مواد ${SEMESTER_LABEL[semester]} للصف ${classroom.grade} ${classroom.section}.`}
        />

        <p className="mt-4 text-center text-[7.5pt] text-slate-400">
          تم إخراج هذا الملخص من نظام رَصْد لإدارة ورصد درجات الطلاب —{" "}
          {new Date().toLocaleDateString("ar-SA")}
        </p>
      </div>
    </>
  );
}
