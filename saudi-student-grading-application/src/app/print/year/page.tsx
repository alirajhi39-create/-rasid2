import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import PrintToolbar from "@/components/print/PrintToolbar";
import { OfficialHeader, SignaturesFooter } from "@/components/print/OfficialHeader";
import { loadPrintSettings } from "@/components/print/settings";
import { getRating, round2, toArabicDigits, yearAverage, yearTotal } from "@/lib/grades";

export const dynamic = "force-dynamic";

type Meta = {
  subject_name: string;
  total_max: string;
  passing_score: string;
  grade: string;
  section: string;
  stage: string;
};

type Row = {
  id: number;
  full_name: string;
  national_id: string | null;
  class_number: number | null;
  t1: string | null;
  t2: string | null;
};

export default async function PrintYearPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string }>;
}) {
  const { subjectId: rawSubjectId } = await searchParams;
  const subjectId = Number(rawSubjectId);

  const session = await getSession();
  if (!session) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center">
        <p className="text-lg font-bold text-slate-700">الجلسة منتهية</p>
      </div>
    );
  }

  await ensureDatabase().catch(() => undefined);
  const authorized = Number.isFinite(subjectId) ? await ownsSubject(subjectId, session.uid) : { owned: false };
  if (!authorized.owned) {
    return (
      <>
        <PrintToolbar title="الكشف السنوي" autoPrint={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">غير مصرح بعرض هذا الكشف</p>
        </div>
      </>
    );
  }

  const settings = await loadPrintSettings(session.uid);

  const metaResult = await db.execute<Meta>(sql`
    SELECT s.name AS subject_name, s.total_max, s.passing_score,
           c.grade, c.section, c.stage
    FROM subjects s JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${Number.isFinite(subjectId) ? subjectId : 0} LIMIT 1
  `);
  const meta = metaResult.rows?.[0];

  if (!meta) {
    return (
      <>
        <PrintToolbar title="الكشف السنوي" autoPrint={false} />
        <div className="rounded-2xl bg-white p-10 text-center">
          <p className="text-lg font-bold text-slate-700">لم يتم تحديد مادة صحيحة</p>
        </div>
      </>
    );
  }

  const rowsResult = await db.execute<Row>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g1.total AS t1, g2.total AS t2
    FROM students st
    LEFT JOIN grades g1 ON g1.student_id = st.id AND g1.subject_id = ${subjectId} AND g1.semester = 'first'
    LEFT JOIN grades g2 ON g2.student_id = st.id AND g2.subject_id = ${subjectId} AND g2.semester = 'second'
    WHERE st.classroom_id = (SELECT classroom_id FROM subjects WHERE id = ${subjectId}) AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const totalMax = Number(meta.total_max);
  const passingScore = Number(meta.passing_score);
  const rows = rowsResult.rows ?? [];

  const count = rows.length;
  const avg = (pick: (r: Row) => number) =>
    count ? round2(rows.reduce((s, r) => s + pick(r), 0) / count) : 0;

  const gradedSecond = rows.filter((r) => Number(r.t2 ?? 0) > 0).length;
  const semestersUsed = (rows.some((r) => Number(r.t1 ?? 0) > 0) ? 1 : 0) + (gradedSecond > 0 ? 1 : 0);
  const yearMaxValue = round2(totalMax * Math.max(1, semestersUsed || 1));
  const yearPass = passingScore * Math.max(1, semestersUsed || 1);

  const avgFirst = avg((r) => Number(r.t1 ?? 0));
  const avgSecond = avg((r) => Number(r.t2 ?? 0));
  const avgYear = avg((r) => yearTotal({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }));
  const avgMean = avg((r) => yearAverage({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }));

  const passedYear = rows.filter(
    (r) => yearTotal({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }) >= yearPass,
  ).length;

  return (
    <>
      <PrintToolbar title={`الكشف السنوي — ${meta.subject_name}`} />

      <div className="print-area print-page rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <OfficialHeader
          settings={settings}
          title={`الكشف السنوي لمجموع الفصلين — مادة ${meta.subject_name}`}
          subtitle={<span className="text-slate-300">|</span>}
          meta={
            <span>
              الصف {meta.grade} — الشعبة {meta.section} · المرحلة {meta.stage} · عدد الطلاب{" "}
              {toArabicDigits(count)}
            </span>
          }
        />

        {/* ملخص عام */}
        <div className="avoid-break mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "متوسط الفصل الأول", value: avgFirst, max: totalMax },
            { label: "متوسط الفصل الثاني", value: avgSecond, max: totalMax },
            { label: "متوسط مجموع الفصلين", value: avgMean, max: yearMaxValue },
            { label: "المجموع السنوي", value: avgYear, max: yearMaxValue },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-400 bg-slate-50 p-2 text-center">
              <p className="text-[8.5pt] font-bold text-slate-600">{card.label}</p>
              <p className="text-[13pt] font-extrabold tabular-nums text-slate-900">
                {toArabicDigits(card.value)}
              </p>
              <p className="text-[7.5pt] text-slate-500">من {toArabicDigits(card.max)}</p>
            </div>
          ))}
        </div>

        <table className="w-full border-collapse text-center text-[10pt]">
          <thead>
            <tr className="bg-slate-100 font-extrabold">
              <th className="border border-slate-500 px-1 py-1.5">م</th>
              <th className="border border-slate-500 px-2 py-1.5 text-right">اسم الطالب</th>
              <th className="border border-slate-500 px-1 py-1.5">الهوية</th>
              <th className="border border-slate-500 px-1 py-1.5">
                الفصل الأول ({toArabicDigits(totalMax)})
              </th>
              <th className="border border-slate-500 px-1 py-1.5">التقدير</th>
              <th className="border border-slate-500 px-1 py-1.5">
                الفصل الثاني ({toArabicDigits(totalMax)})
              </th>
              <th className="border border-slate-500 px-1 py-1.5">التقدير</th>
              <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">
                مجموع الفصلين ({toArabicDigits(yearMaxValue)})
              </th>
              <th className="border border-slate-500 bg-slate-200 px-1 py-1.5">المتوسط</th>
              <th className="border border-slate-500 px-1 py-1.5">%</th>
              <th className="border border-slate-500 px-1 py-1.5">النتيجة السنوية</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const first = Number(row.t1 ?? 0);
              const second = Number(row.t2 ?? 0);
              const yT = yearTotal({ first, second });
              const yA = yearAverage({ first, second });
              const r1 = getRating(first, totalMax, passingScore);
              const r2 = getRating(second, totalMax, passingScore);
              const yr = getRating(yT, yearMaxValue, yearPass);
              const pct = yearMaxValue > 0 ? (yT / yearMaxValue) * 100 : 0;
              return (
                <tr key={row.id} className="avoid-break">
                  <td className="border border-slate-400 px-1 py-1 tabular-nums">
                    {toArabicDigits(row.class_number ?? index + 1)}
                  </td>
                  <td className="border border-slate-400 px-2 py-1 text-right font-semibold">
                    {row.full_name}
                  </td>
                  <td dir="ltr" className="border border-slate-400 px-1 py-1 text-[8pt] tabular-nums">
                    {row.national_id ?? "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 font-bold tabular-nums">
                    {first > 0 ? toArabicDigits(first) : "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-[9pt]">{first > 0 ? r1.label : "—"}</td>
                  <td className="border border-slate-400 px-1 py-1 font-bold tabular-nums">
                    {second > 0 ? toArabicDigits(second) : "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-[9pt]">
                    {second > 0 ? r2.label : "—"}
                  </td>
                  <td className="border border-slate-400 bg-slate-50 px-1 py-1 font-extrabold tabular-nums">
                    {yT > 0 ? toArabicDigits(yT) : "—"}
                  </td>
                  <td className="border border-slate-400 bg-slate-50 px-1 py-1 font-bold tabular-nums">
                    {yA > 0 ? toArabicDigits(yA) : "—"}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 tabular-nums">
                    {yT > 0 ? `${toArabicDigits(Math.round(pct))}%` : "—"}
                  </td>
                  <td
                    className={`border border-slate-400 px-1 py-1 font-bold ${
                      yT === 0 ? "" : yr.passed ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {yT === 0 ? "—" : yr.passed ? "ناجح" : "راسب"}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-extrabold">
              <td colSpan={3} className="border border-slate-500 px-2 py-1.5 text-right">
                الإحصاء السنوي
              </td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">{toArabicDigits(avgFirst)}</td>
              <td className="border border-slate-500 px-1 py-1.5 text-[9pt]">المتوسط</td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">{toArabicDigits(avgSecond)}</td>
              <td className="border border-slate-500 px-1 py-1.5 text-[9pt]">المتوسط</td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">{toArabicDigits(avgYear)}</td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">{toArabicDigits(avgMean)}</td>
              <td className="border border-slate-500 px-1 py-1.5 tabular-nums">
                {toArabicDigits(yearMaxValue > 0 ? Math.round((avgYear / yearMaxValue) * 100) : 0)}%
              </td>
              <td className="border border-slate-500 px-1 py-1.5">
                ناجح: {toArabicDigits(passedYear)} / راسب: {toArabicDigits(count - passedYear)}
              </td>
            </tr>
          </tbody>
        </table>

        <SignaturesFooter
          teacherName={settings.teacherName}
          headmasterName={settings.headmasterName}
          note="يشمل هذا الكشف مجموع الفصلين الدراسيين الأول والثاني والمتوسط بينهما لكل طالب."
        />

        <p className="mt-4 text-center text-[7.5pt] text-slate-400">
          تم إخراج هذا الكشف من نظام رَصْد لإدارة ورصد درجات الطلاب —{" "}
          {new Date().toLocaleDateString("ar-SA")}
        </p>
      </div>
    </>
  );
}
