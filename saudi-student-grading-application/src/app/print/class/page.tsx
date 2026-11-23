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
  round2,
  statsFor,
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

export default async function PrintClassPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; semester?: string; hideNid?: string }>;
}) {
  const params = await searchParams;
  const subjectId = Number(params.subjectId);
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
        <PrintToolbar title="كشف درجات الفصل" autoPrint={false} hideNid={hideNid} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">غير مصرح بعرض هذا الكشف</p>
          <p className="mt-2 text-sm text-slate-500">هذه المادة ليست من موادك.</p>
        </div>
      </>
    );
  }

  const settings = await loadPrintSettings(session.uid);
  const ratingThresholds = thresholdsOf(settings);

  const metaResult = await db.execute<Meta>(sql`
    SELECT s.name AS subject_name, s.items, s.total_max, s.passing_score,
           s.classroom_id, c.grade, c.section, c.stage
    FROM subjects s LEFT JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${Number.isFinite(subjectId) ? subjectId : 0} LIMIT 1
  `);
  const meta = metaResult.rows?.[0];

  if (!meta) {
    return (
      <>
        <PrintToolbar title="كشف درجات الفصل" autoPrint={false} hideNid={hideNid} supportsNid={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">لم يتم تحديد مادة صحيحة</p>
          <p className="mt-2 text-sm text-slate-500">ارجع إلى صفحة التقارير واختر الفصل والمادة.</p>
        </div>
      </>
    );
  }

  if (!meta.classroom_id) {
    return (
      <>
        <PrintToolbar title={"كشف درجات الفصل"} autoPrint={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">المادة غير مرتبطة بفصل دراسي</p>
          <p className="mt-2 text-sm text-slate-500">
            اربط المادة بأحد فصولك من صفحة المواد ثم أعد الطباعة.
          </p>
        </div>
      </>
    );
  }

  const rowsResult = await db.execute<Row>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g1.values AS v1, g1.total AS t1, g2.values AS v2, g2.total AS t2
    FROM students st
    LEFT JOIN grades g1 ON g1.student_id = st.id AND g1.subject_id = ${subjectId} AND g1.semester = 'first'
    LEFT JOIN grades g2 ON g2.student_id = st.id AND g2.subject_id = ${subjectId} AND g2.semester = 'second'
    WHERE st.classroom_id = ${meta.classroom_id} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const items = normalizeItems(meta.items ?? []);
  const totalMax = Number(meta.total_max);
  const passingScore = Number(meta.passing_score);
  const rows = rowsResult.rows ?? [];

  const semValues = (row: Row) => (semester === "first" ? (row.v1 ?? {}) : (row.v2 ?? {})) as GradeValues;
  const semTotal = (row: Row) => Number((semester === "first" ? row.t1 : row.t2) ?? 0);
  const otherTotal = (row: Row) => Number((semester === "first" ? row.t2 : row.t1) ?? 0);

  const stats = statsFor(rows.map((r) => ({ total: semTotal(r) })), totalMax, passingScore);

  const groupColumns = (["performance", "written"] as const)
    .map((g) => ({ group: g, list: items.filter((i) => toGroup(i.group) === g) }))
    .filter((g) => g.list.length > 0);

  const gradedOther = rows.filter((r) => otherTotal(r) > 0).length;
  const yearMaxValue = round2(totalMax * (gradedOther > 0 ? 2 : 1));
  const avgYear = rows.length
    ? round2(rows.reduce((s, r) => s + yearTotal({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }), 0) / rows.length)
    : 0;
  const avgPeriodMean = rows.length
    ? round2(rows.reduce((s, r) => s + periodAverage(items, semValues(r)), 0) / rows.length)
    : 0;
  // مجموع كل مجموعة لكل طالب (المهام الأدائية / التقويمات التحريرية)
  const groupGot = (row: Row, group: "performance" | "written") =>
    computeGroupTotal(items, semValues(row), group).got;
  const groupMaxOf = (group: "performance" | "written") =>
    groupColumns.find((g) => g.group === group)?.list.reduce((s, i) => s + i.max, 0) ?? 0;

  const avgMean = rows.length
    ? round2(
        rows.reduce(
          (s, r) => s + yearAverage({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }),
          0,
        ) / rows.length,
      )
    : 0;

  return (
    <>
      <PrintToolbar
        title={`كشف درجات — ${meta.subject_name} — ${SEMESTER_LABEL[semester]}`}
        hideNid={hideNid}
      />

      <div className="print-area print-page rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <OfficialHeader
          settings={settings}
          title={`كشف رصد درجات مادة ${meta.subject_name}`}
          meta={
            <span>
              {SEMESTER_LABEL[semester]} · الصف {meta.grade} — الشعبة {meta.section} · المرحلة {meta.stage} ·
              عدد الطلاب {toArabicDigits(rows.length)}
            </span>
          }
        />

        <table className="w-full border-collapse text-center text-[9.5pt]">
          <thead>
            <tr className="bg-slate-100 font-extrabold">
              <th className="border border-slate-500 px-1 py-1.5">
                م
              </th>
              <th className="border border-slate-500 px-2 py-1.5">
                اسم الطالب
              </th>
              {!hideNid && (
                <th className="border border-slate-500 px-1 py-1.5">الهوية</th>
              )}
              {groupColumns.map((g) => (
                <th
                  key={g.group}
                  className={`border border-slate-500 px-1.5 py-2 text-[10.5pt] ${
                    g.group === "performance" ? "bg-sky-100" : "bg-violet-100"
                  }`}
                >
                  {GROUP_LABEL[g.group]}
                  <br />
                  <span className="text-[9pt] font-normal">
                    ({toArabicDigits(g.list.reduce((s, i) => s + i.max, 0))})
                  </span>
                </th>
              ))}
              <th className="border border-slate-500 px-1 py-1.5">
                المجموع ({toArabicDigits(totalMax)})
              </th>
              <th className="border border-slate-500 px-1 py-1.5">
                متوسط الفترتين
              </th>
              <th className="border border-slate-500 px-1 py-1.5">
                %
              </th>
              <th className="border border-slate-500 px-1 py-1.5">
                التقدير
              </th>
              <th className="border border-slate-500 px-1 py-1.5">
                الفصل الآخر
              </th>
              <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">
                مجموع الفصلين
              </th>
              <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">
                المتوسط
              </th>
              <th className="border border-slate-500 px-1 py-1.5">
                النتيجة
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const values = semValues(row);
              const total = semTotal(row);
              const pct = totalMax > 0 ? (total / totalMax) * 100 : 0;
              const rating = getRating(total, totalMax, passingScore, ratingThresholds);
              const pAvg = periodAverage(items, values);
              const other = otherTotal(row);
              const yT = yearTotal(
                semester === "first" ? { first: total, second: other } : { first: other, second: total },
              );
              const yA = yearAverage(
                semester === "first" ? { first: total, second: other } : { first: other, second: total },
              );
              return (
                <tr key={row.id} className="avoid-break">
                  <td className="border border-slate-400 px-1 py-1 tabular-nums">
                    {toArabicDigits(row.class_number ?? index + 1)}
                  </td>
                  <td className="border border-slate-400 px-2 py-1 text-right font-semibold">
                    {row.full_name}
                  </td>
                  {!hideNid && (
                    <td dir="ltr" className="border border-slate-400 px-1 py-1 text-[8pt] tabular-nums">
                      {row.national_id ?? "—"}
                    </td>
                  )}
                  {groupColumns.map((g) => {
                    const got = groupGot(row, g.group);
                    return (
                      <td
                        key={g.group}
                        className={`border border-slate-400 px-1 py-1 font-extrabold tabular-nums ${
                          g.group === "performance" ? "bg-sky-50" : "bg-violet-50"
                        }`}
                      >
                        {got > 0 ? toArabicDigits(got) : "—"}
                      </td>
                    );
                  })}
                  <td className="border border-slate-400 px-1 py-1 font-extrabold tabular-nums">
                    {toArabicDigits(total)}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 font-bold tabular-nums">
                    {pAvg > 0 ? toArabicDigits(pAvg) : "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 tabular-nums">
                    {totalMax > 0 ? `${toArabicDigits(Math.round(pct))}%` : "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1">{rating.label}</td>
                  <td className="border border-slate-400 px-1 py-1 tabular-nums">
                    {other > 0 ? toArabicDigits(other) : "—"}
                  </td>
                  <td className="border border-slate-400 bg-slate-50 px-1 py-1 font-extrabold tabular-nums">
                    {yT > 0 ? toArabicDigits(yT) : "—"}
                  </td>
                  <td className="border border-slate-400 bg-slate-50 px-1 py-1 font-bold tabular-nums">
                    {yA > 0 ? toArabicDigits(yA) : "—"}
                  </td>
                  <td
                    className={`border border-slate-400 px-1 py-1 font-bold ${
                      total === 0 ? "" : rating.passed ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {total === 0 ? "—" : rating.passed ? "ناجح" : "راسب"}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-extrabold">
              <td colSpan={hideNid ? 2 : 3} className="border border-slate-500 px-2 py-1.5 text-right">
                الإحصاء: الطلاب {toArabicDigits(stats.count)} · الناجحون {toArabicDigits(stats.passed)} ·
                الراسبون {toArabicDigits(stats.failed)} · المتوسط {toArabicDigits(stats.avg)} · النسبة{" "}
                {toArabicDigits(stats.pct)}%
              </td>
              {groupColumns.map((g) => {
                const avg = rows.length
                  ? round2(rows.reduce((s, r) => s + groupGot(r, g.group), 0) / rows.length)
                  : 0;
                return (
                  <td
                    key={g.group}
                    className={`border border-slate-500 px-1 py-1.5 tabular-nums ${
                      g.group === "performance" ? "bg-sky-50" : "bg-violet-50"
                    }`}
                  >
                    {toArabicDigits(avg)}
                  </td>
                );
              })}
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                {toArabicDigits(stats.avg)}
              </td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                {avgPeriodMean > 0 ? toArabicDigits(avgPeriodMean) : "—"}
              </td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                {toArabicDigits(stats.pct)}%
              </td>
              <td colSpan={2} className="border border-slate-500 px-1 py-1.5">
                متوسط الفصلين: {toArabicDigits(avgMean)}
              </td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">{toArabicDigits(avgYear)}</td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                {toArabicDigits(avgMean)}
              </td>
              <td className="border border-slate-500 px-1 py-1.5">
                من {toArabicDigits(yearMaxValue)}
              </td>
            </tr>
          </tbody>
        </table>

        <SignaturesFooter
          teacherName={settings.teacherName}
          headmasterName={settings.headmasterName}
          note="يُعتمد هذا الكشف بعد مراجعته وتوقيعه من معلم المادة ومدير المدرسة."
        />

        <p className="mt-4 text-center text-[7.5pt] text-slate-400">
          تم إخراج هذا الكشف من نظام رَصْد لإدارة ورصد درجات الطلاب —{" "}
          {new Date().toLocaleDateString("ar-SA")}
        </p>
      </div>
    </>
  );
}
