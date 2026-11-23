import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import {
  getRating,
  normalizeItems,
  periodAverage,
  round2,
  thresholdsFrom,
  yearAverage,
  yearTotal,
} from "@/lib/grades";
import { GROUP_LABEL, PERIOD_SHORT, toGroup } from "@/lib/constants";
import type { GradeValues, ScoreItem, Semester } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * تصدير الدرجات بصيغة Excel (.xlsx) مطابقة لقوالب استيراد نظام نور
 * GET /api/export?subjectId=1
 * ثلاث أوراق: كشف الدرجات (بفصليه وفترتيه) + توزيع الدرجات + الإحصاء
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const subjectId = Number(url.searchParams.get("subjectId"));
  if (!Number.isFinite(subjectId) || subjectId <= 0) {
    return NextResponse.json({ ok: false, error: "معرّف المادة مطلوب" }, { status: 400 });
  }
  if (!(await ownsSubject(subjectId, guard.session.uid)).owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  const subjectResult = await db.execute<{
    id: number;
    name: string;
    items: ScoreItem[];
    total_max: string;
    passing_score: string;
    grade: string | null;
    section: string | null;
    stage: string | null;
    classroom_id: number | null;
    school_name: string;
    academic_year: string;
    teacher: string;
    pct_excellent: number;
    pct_vgood: number;
    pct_good: number;
    pct_pass: number;
  }>(sql`
    SELECT s.id, s.name, s.items, s.total_max, s.passing_score, s.classroom_id,
           c.grade, c.section, c.stage,
           st.school_name, st.academic_year,
           st.pct_excellent, st.pct_vgood, st.pct_good, st.pct_pass,
           COALESCE(NULLIF(u.full_name, ''), st.teacher_name) AS teacher
    FROM subjects s
    LEFT JOIN classrooms c ON c.id = s.classroom_id
    CROSS JOIN app_settings st
    LEFT JOIN users u ON u.id = ${guard.session.uid}
    WHERE s.id = ${subjectId} LIMIT 1
  `);
  const subject = subjectResult.rows?.[0];
  if (!subject) {
    return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
  }

  const rowsResult = await db.execute<{
    id: number;
    full_name: string;
    national_id: string | null;
    class_number: number | null;
    v1: GradeValues | null;
    t1: string | null;
    v2: GradeValues | null;
    t2: string | null;
  }>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g1.values AS v1, g1.total AS t1,
           g2.values AS v2, g2.total AS t2
    FROM students st
    LEFT JOIN grades g1 ON g1.student_id = st.id AND g1.subject_id = ${subjectId} AND g1.semester = 'first'
    LEFT JOIN grades g2 ON g2.student_id = st.id AND g2.subject_id = ${subjectId} AND g2.semester = 'second'
    WHERE st.classroom_id = ${subject.classroom_id} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const items = normalizeItems(subject.items ?? []);
  const periods: Semester[] = ["first", "second"];
  const totalMax = Number(subject.total_max);
  const passingScore = Number(subject.passing_score);
  const students = rowsResult.rows ?? [];
  const ratingThresholds = thresholdsFrom({
    pctExcellent: subject.pct_excellent,
    pctVgood: subject.pct_vgood,
    pctGood: subject.pct_good,
    pctPass: subject.pct_pass,
  });

  const groupGroupped = (["performance", "written"] as const)
    .map((g) => ({ group: g, list: items.filter((i) => toGroup(i.group) === g) }))
    .filter((g) => g.list.length > 0);

  /* ---------------- ورقة ١: كشف رصد بنظام نور (الفصلان والفترتان) ---------------- */
  const header1 = ["الرقم", "رقم الهوية", "اسم الطالب (الرباعي)"];
  for (const sem of periods) {
    for (const grp of groupGroupped) {
      for (const item of grp.list) {
        header1.push(
          `${item.label} [${GROUP_LABEL[grp.group]} ${PERIOD_SHORT[item.period]}] — ${sem === "first" ? "فصل ١" : "فصل ٢"}`,
        );
      }
    }
    header1.push(
      `مجموع المهام الأدائية (${sem === "first" ? "فصل ١" : "فصل ٢"})`,
      `مجموع التقويمات التحريرية (${sem === "first" ? "فصل ١" : "فصل ٢"})`,
      `مجموع ${sem === "first" ? "الفصل الأول" : "الفصل الثاني"}`,
      "متوسط الفترتين",
      "النسبة %",
      "التقدير",
    );
  }
  header1.push("مجموع الفصلين", "متوسط الفصلين", "النتيجة السنوية");

  const dataRows = students.map((row, index) => {
    const v1 = (row.v1 ?? {}) as GradeValues;
    const v2 = (row.v2 ?? {}) as GradeValues;
    const t1 = Number(row.t1 ?? 0);
    const t2 = Number(row.t2 ?? 0);
    const out: (string | number)[] = [
      row.class_number ?? index + 1,
      row.national_id ?? "",
      row.full_name,
    ];
    for (const sem of periods) {
      const values = sem === "first" ? v1 : v2;
      for (const grp of groupGroupped) {
        for (const item of grp.list) {
          const v = values[item.id];
          out.push(typeof v === "number" ? v : "");
        }
      }
      const semTotal = sem === "first" ? t1 : t2;
      const rating = getRating(semTotal, totalMax, passingScore, ratingThresholds);
      const perfSum = groupGroupped
        .find((g) => g.group === "performance")
        ?.list.reduce((s2, i) => s2 + (typeof values[i.id] === "number" ? (values[i.id] as number) : 0), 0) ?? 0;
      const writSum = groupGroupped
        .find((g) => g.group === "written")
        ?.list.reduce((s2, i) => s2 + (typeof values[i.id] === "number" ? (values[i.id] as number) : 0), 0) ?? 0;
      out.push(
        perfSum,
        writSum,
        semTotal,
        periodAverage(items, values),
        totalMax > 0 ? round2((semTotal / totalMax) * 100) : 0,
        semTotal > 0 ? rating.label : "",
      );
    }
    const yT = yearTotal({ first: t1, second: t2 });
    const yA = yearAverage({ first: t1, second: t2 });
    const used = (t1 > 0 ? 1 : 0) + (t2 > 0 ? 1 : 0);
    const yPass = passingScore * Math.max(1, used || 1);
    out.push(yT, yA, yT > 0 ? (yT >= yPass ? "ناجح" : "راسب") : "");
    return out;
  });

  const wsNoor = XLSX.utils.aoa_to_sheet([
    ["المملكة العربية السعودية — وزارة التعليم"],
    [subject.school_name, subject.academic_year],
    [
      `كشف درجات مادة: ${subject.name}`,
      `الصف: ${subject.grade} ${subject.section}`,
      `المرحلة: ${subject.stage}`,
      `معلم المادة: ${subject.teacher}`,
    ],
    [],
    header1,
    ...dataRows,
  ]);
  wsNoor["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 34 },
    ...header1.slice(3).map(() => ({ wch: 11 })),
  ];
  (wsNoor as unknown as { Workbook?: { Views?: { RTL?: boolean }[] } }).Workbook = {
    Views: [{ RTL: true }],
  };

  /* ---------------- ورقة ٢: ملخص توزيع الدرجات ---------------- */
  const distRows: (string | number)[][] = [
    ["بند التوزيع", "المجموعة", "الفترة", "الدرجة العظمى"],
    ...items.map((item) => [
      item.label,
      GROUP_LABEL[toGroup(item.group)],
      item.period === "p1" ? "الفترة الأولى" : "الفترة الثانية",
      item.max,
    ]),
    ["مجموع المهام الأدائية", "", "", groupGroupped.find((g) => g.group === "performance")?.list.reduce((s, i) => s + i.max, 0) ?? 0],
    ["الهدف المعتمد للمهام الأدائية", "", "", 40],
    ["مجموع التقويمات التحريرية", "", "", groupGroupped.find((g) => g.group === "written")?.list.reduce((s, i) => s + i.max, 0) ?? 0],
    ["الهدف المعتمد للتقويمات التحريرية", "", "", 60],
    ["مجموع الفصل الدراسي", "", "", totalMax],
    ["درجة النجاح", "", "", passingScore],
    ["مجموع الفصلين (السنوي)", "", "", totalMax * 2],
  ];
  const wsDist = XLSX.utils.aoa_to_sheet(distRows);
  wsDist["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];

  /* ---------------- ورقة ٣: الملخص الإحصائي ---------------- */
  const t1List = students.map((r) => Number(r.t1 ?? 0));
  const t2List = students.map((r) => Number(r.t2 ?? 0));
  const count = students.length;
  const avg = (list: number[]) => (count ? round2(list.reduce((a, b) => a + b, 0) / count) : 0);
  const gradedSecond = t2List.filter((t) => t > 0).length;

  // متوسط مجموع الفترتين لكل فصل دراسي (لكل طالب ثم متوسط الصف)
  const avgOf = (pick: (r: (typeof students)[number]) => number) =>
    count ? round2(students.reduce((s, r) => s + pick(r), 0) / count) : 0;
  const avgPeriodFirst = avgOf((r) => periodAverage(items, (r.v1 ?? {}) as GradeValues));
  const avgPeriodSecond = avgOf((r) => periodAverage(items, (r.v2 ?? {}) as GradeValues));
  const yearList = students.map((r) =>
    yearTotal({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }),
  );
  const meanList = students.map((r) =>
    yearAverage({ first: Number(r.t1 ?? 0), second: Number(r.t2 ?? 0) }),
  );

  const wsStats = XLSX.utils.aoa_to_sheet([
    ["البيان", "القيمة"],
    ["المادة", subject.name],
    ["الصف", `${subject.grade} ${subject.section}`],
    ["معلم المادة", subject.teacher],
    ["عدد الطلاب", count],
    ["متوسط الفصل الدراسي الأول", avg(t1List)],
    ["متوسط الفصل الدراسي الثاني", avg(t2List)],
    ["متوسط مجموع الفترتين — الفصل الأول", avgPeriodFirst],
    ["متوسط مجموع الفترتين — الفصل الثاني", avgPeriodSecond],
    ["متوسط مجموع الفصلين", avg(meanList)],
    ["متوسط المجموع السنوي", avg(yearList)],
    ["المتوسط العام بين الفصلين", avg(meanList)],
    ["عدد المرصود لهم في الفصل الأول", t1List.filter((t) => t > 0).length],
    ["عدد المرصود لهم في الفصل الثاني", gradedSecond],
    ["أعلى درجة في الفصل الأول", count ? Math.max(...t1List) : 0],
    ["أدنى درجة في الفصل الأول", count ? Math.min(...t1List) : 0],
    ["أعلى مجموع سنوي", count ? Math.max(...yearList) : 0],
    ["المجموع السنوي الممكن", totalMax * Math.max(1, gradedSecond > 0 ? 2 : 1)],
  ]);
  wsStats["!cols"] = [{ wch: 30 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsNoor, "كشف الدرجات");
  XLSX.utils.book_append_sheet(wb, wsDist, "توزيع الدرجات");
  XLSX.utils.book_append_sheet(wb, wsStats, "الإحصاء");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const safeName = `${subject.grade}-${subject.section}-${subject.name}`.replace(/[^\p{L}\p{N}\-_ ]/gu, "");
  const fileName = encodeURIComponent(`نور-${safeName}.xlsx`);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}


