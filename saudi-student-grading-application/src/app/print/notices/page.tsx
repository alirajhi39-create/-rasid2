import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import PrintToolbar from "@/components/print/PrintToolbar";
import { OfficialHeader, SignaturesFooter } from "@/components/print/OfficialHeader";
import { loadPrintSettings, thresholdsOf } from "@/components/print/settings";
import {
  computeGroupTotal,
  getRating,
  normalizeItems,
  periodAverage,
  toArabicDigits,
  yearAverage,
  yearTotal,
} from "@/lib/grades";
import { GROUP_LABEL, toGroup } from "@/lib/constants";
import { SEMESTER_LABEL, toSemester } from "@/lib/constants";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";

type Meta = {
  subject_name: string;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
  grade: string | null;
  section: string | null;
  stage: string | null;
  classroom_id: number | null;
};

type Row = {
  id: number;
  full_name: string;
  national_id: string | null;
  class_number: number | null;
  v1: GradeValues | null;
  t1: string | null;
  v2: GradeValues | null;
  t2: string | null;
};

export default async function PrintNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; semester?: string; studentId?: string; hideNid?: string }>;
}) {
  const params = await searchParams;
  const subjectId = Number(params.subjectId);
  const studentFilter = Number(params.studentId);
  const semester = toSemester(params.semester);
  const hideNid = params.hideNid === "1";

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
  const authorized = Number.isFinite(subjectId) ? await ownsSubject(subjectId, session.uid) : { owned: false };
  if (!authorized.owned) {
    return (
      <>
        <PrintToolbar title="إشعارات الطلاب" autoPrint={false} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">غير مصرح بعرض هذه الإشعارات</p>
          <p className="mt-2 text-sm text-slate-500">هذه المادة ليست من موادك.</p>
        </div>
      </>
    );
  }

  const settings = await loadPrintSettings(session.uid);
  const ratingThresholds = thresholdsOf(settings);

  const metaResult = await db.execute<Meta>(sql`
    SELECT s.name AS subject_name, s.items, s.total_max, s.passing_score,
           c.grade, c.section, c.stage, s.classroom_id
    FROM subjects s LEFT JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${Number.isFinite(subjectId) ? subjectId : 0} LIMIT 1
  `);
  const meta = metaResult.rows?.[0];

  if (!meta) {
    return (
      <>
        <PrintToolbar title="إشعارات الطلاب" autoPrint={false} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">لم يتم تحديد مادة صحيحة</p>
        </div>
      </>
    );
  }

  if (!meta.classroom_id) {
    return (
      <>
        <PrintToolbar title={"إشعارات الطلاب"} autoPrint={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">المادة غير مرتبطة بفصل دراسي</p>
          <p className="mt-2 text-sm text-slate-500">
            اربط المادة بأحد فصولك من صفحة المواد ثم أعد الطباعة.
          </p>
        </div>
      </>
    );
  }

  const filterClause =
    Number.isFinite(studentFilter) && studentFilter > 0 ? sql`AND st.id = ${studentFilter}` : sql``;

  const rowsResult = await db.execute<Row>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g1.values AS v1, g1.total AS t1, g2.values AS v2, g2.total AS t2
    FROM students st
    LEFT JOIN grades g1 ON g1.student_id = st.id AND g1.subject_id = ${subjectId} AND g1.semester = 'first'
    LEFT JOIN grades g2 ON g2.student_id = st.id AND g2.subject_id = ${subjectId} AND g2.semester = 'second'
    WHERE st.classroom_id = ${meta.classroom_id} AND st.active = true ${filterClause}
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const items = normalizeItems(meta.items ?? []);
  const totalMax = Number(meta.total_max);
  const passingScore = Number(meta.passing_score);
  const rows = rowsResult.rows ?? [];

  // نعرض مجموع كل مجموعة فقط (المهام الأدائية / التقويمات التحريرية)
  const groupColumns = (["performance", "written"] as const)
    .map((g) => ({ group: g, list: items.filter((i) => toGroup(i.group) === g) }))
    .filter((g) => g.list.length > 0);
  const groupMaxOf = (g: "performance" | "written") =>
    groupColumns.find((x) => x.group === g)?.list.reduce((s, i) => s + i.max, 0) ?? 0;

  return (
    <>
      <PrintToolbar
        title={`إشعارات الطلاب — ${meta.subject_name} — ${SEMESTER_LABEL[semester]}`}
        autoPrint={rows.length <= 3}
        hideNid={hideNid}
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">لا يوجد طلاب في هذا الفصل</p>
        </div>
      ) : (
        <div className="notices-grid grid gap-5 lg:grid-cols-2">
          {rows.map((row) => {
            const values = (semester === "first" ? (row.v1 ?? {}) : (row.v2 ?? {})) as GradeValues;
            const total = Number((semester === "first" ? row.t1 : row.t2) ?? 0);
            const other = Number((semester === "first" ? row.t2 : row.t1) ?? 0);
            const pct = totalMax > 0 ? (total / totalMax) * 100 : 0;
            const rating = getRating(total, totalMax, passingScore, ratingThresholds);
            const pAvg = periodAverage(items, values);
            const groupGotOf = (g: "performance" | "written") => computeGroupTotal(items, values, g).got;
            const yT = yearTotal(
              semester === "first" ? { first: total, second: other } : { first: other, second: total },
            );
            const yA = yearAverage(
              semester === "first" ? { first: total, second: other } : { first: other, second: total },
            );

            return (
              <div
                key={row.id}
                className="print-area avoid-break rounded-2xl bg-white p-5 shadow-lg sm:p-6"
              >
                <OfficialHeader
                  settings={settings}
                  title="إشعار درجات طالب"
                  meta={`مادة ${meta.subject_name} — ${SEMESTER_LABEL[semester]}`}
                />

                {/* بيانات الطالب */}
                <div className="avoid-break mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-[10pt] font-bold text-slate-800 sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500">اسم الطالب: </span>
                    {row.full_name}
                  </div>
                  <div>
                    <span className="text-slate-500">الصف: </span>
                    {meta.grade} — {meta.section}
                  </div>
                  <div>
                    <span className="text-slate-500">الرقم: </span>
                    {toArabicDigits(row.class_number ?? "—")}
                  </div>
                  {!hideNid && (
                    <div>
                      <span className="text-slate-500">الهوية: </span>
                      <span dir="ltr">{row.national_id ?? "—"}</span>
                    </div>
                  )}
                </div>

                {/* تفصيل الدرجات — مجموع كل مجموعة فقط */}
                <table className="w-full border-collapse text-center text-[11pt]">
                  <thead>
                    <tr className="bg-slate-100 font-extrabold">
                      <th className="border border-slate-500 px-2 py-1.5">م</th>
                      <th className="border border-slate-500 px-2 py-1.5 text-right">بند التقييم</th>
                      <th className="border border-slate-500 px-2 py-1.5">عدد الأعمدة</th>
                      <th className="border border-slate-500 px-2 py-1.5">الدرجة العظمى</th>
                      <th className="border border-slate-500 px-2 py-1.5">الدرجة المحصلة</th>
                      <th className="border border-slate-500 px-2 py-1.5">النسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupColumns.map((g, index) => {
                      const got = groupGotOf(g.group);
                      const max = groupMaxOf(g.group);
                      const pct = max > 0 ? Math.round((got / max) * 100) : 0;
                      return (
                        <tr key={g.group} className={g.group === "performance" ? "bg-sky-50" : "bg-violet-50"}>
                          <td className="border border-slate-400 px-2 py-1.5 tabular-nums">
                            {toArabicDigits(index + 1)}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right font-bold">
                            {GROUP_LABEL[g.group]}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 tabular-nums">
                            {toArabicDigits(g.list.length)}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 tabular-nums">
                            {toArabicDigits(max)}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 font-extrabold tabular-nums">
                            {got > 0 ? toArabicDigits(got) : "—"}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 tabular-nums">
                            {got > 0 ? `${toArabicDigits(pct)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-100 text-[12pt] font-extrabold">
                      <td className="border border-slate-500 px-2 py-1.5"></td>
                      <td className="border border-slate-500 px-2 py-1.5 text-right">
                        مجموع {SEMESTER_LABEL[semester]}
                      </td>
                      <td className="border border-slate-500 px-2 py-1.5 tabular-nums">
                        {toArabicDigits(items.length)}
                      </td>
                      <td className="border border-slate-500 px-2 py-1.5 tabular-nums">
                        {toArabicDigits(totalMax)}
                      </td>
                      <td className="border border-slate-500 px-2 py-1.5 tabular-nums">
                        {toArabicDigits(total)}
                      </td>
                      <td className="border border-slate-500 px-2 py-1.5 tabular-nums">
                        {toArabicDigits(Math.round(pct))}%
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* النتيجة */}
                <div className="avoid-break mt-4 flex flex-wrap items-center justify-center gap-3">
                  <div className="rounded-lg border-2 border-slate-700 px-5 py-2 text-center">
                    <p className="text-[9pt] font-bold text-slate-500">
                      مجموع {SEMESTER_LABEL[semester]}
                    </p>
                    <p className="text-[14pt] font-extrabold tabular-nums">
                      {toArabicDigits(total)} / {toArabicDigits(totalMax)}
                    </p>
                  </div>
                  <div className="rounded-lg border-2 border-slate-700 px-5 py-2 text-center">
                    <p className="text-[9pt] font-bold text-slate-500">التقدير</p>
                    <p className="text-[14pt] font-extrabold">{rating.label}</p>
                  </div>
                  <div className="rounded-lg border-2 border-slate-700 bg-sky-50 px-5 py-2 text-center">
                    <p className="text-[9pt] font-bold text-slate-500">متوسط الفترتين</p>
                    <p className="text-[14pt] font-extrabold tabular-nums">
                      {pAvg > 0 ? toArabicDigits(pAvg) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border-2 border-slate-700 bg-slate-50 px-5 py-2 text-center">
                    <p className="text-[9pt] font-bold text-slate-500">مجموع الفصلين</p>
                    <p className="text-[14pt] font-extrabold tabular-nums">
                      {yT > 0 ? toArabicDigits(yT) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border-2 border-slate-700 bg-slate-50 px-5 py-2 text-center">
                    <p className="text-[9pt] font-bold text-slate-500">المتوسط</p>
                    <p className="text-[14pt] font-extrabold tabular-nums">
                      {yA > 0 ? toArabicDigits(yA) : "—"}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg border-2 px-5 py-2 text-center ${
                      total === 0
                        ? "border-slate-400 text-slate-500"
                        : rating.passed
                          ? "border-emerald-700 text-emerald-800"
                          : "border-rose-700 text-rose-800"
                    }`}
                  >
                    <p className="text-[9pt] font-bold text-slate-500">النتيجة</p>
                    <p className="text-[14pt] font-extrabold">
                      {total === 0 ? "لم يُرصد" : rating.passed ? "ناجح ومنقول" : "راسب"}
                    </p>
                  </div>
                </div>

                <SignaturesFooter
                  teacherName={settings.teacherName}
                  headmasterName={settings.headmasterName}
                  note="ولي أمر الطالب: يُرجى التوقيع بالعلم واستعادة الإشعار لمدرسة المادة."
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
