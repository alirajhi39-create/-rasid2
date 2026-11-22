import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import {
  periodAverage,
  periodAverageMax,
  round2,
  toPeriod,
  yearAverage,
  yearTotal,
} from "@/lib/grades";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * =====================================================================
 *  GET /api/grades/summary?subjectId=1
 *  يحسب:
 *   • مجموع كل فصل دراسي (الأول / الثاني)
 *   • متوسط مجموع الفترتين داخل كل فصل دراسي
 *   • مجموع الفصلين (السنوي)
 *   • متوسط مجموع الفصلين
 * =====================================================================
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
  const owner = await ownsSubject(subjectId, guard.session.uid);
  if (!owner.owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  const metaResult = await db.execute<{
    id: number;
    name: string;
    items: ScoreItem[];
    total_max: string;
    passing_score: string;
    grade: string | null;
    section: string | null;
    classroom_id: number | null;
  }>(sql`
    SELECT s.id, s.name, s.items, s.total_max, s.passing_score,
           c.grade, c.section, s.classroom_id
    FROM subjects s LEFT JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${subjectId} LIMIT 1
  `);
  const meta = metaResult.rows?.[0];
  if (!meta) {
    return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
  }

  const items = (meta.items ?? []).map((item) => ({ ...item, period: toPeriod(item.period) }));
  const totalMax = Number(meta.total_max);
  const passingScore = Number(meta.passing_score);
  const periodAvgMax = periodAverageMax(items);

  // مادة غير مرتبطة بفصل → لا يوجد طلاب
  if (!meta.classroom_id) {
    return NextResponse.json({
      ok: true,
      unlinked: true,
      subject: {
        id: meta.id,
        name: meta.name,
        grade: null,
        section: null,
        totalMax,
        passingScore,
        periodAvgMax,
      },
      rows: [],
      stats: {
        count: 0, gradedFirst: 0, gradedSecond: 0,
        avgFirst: 0, avgSecond: 0, avgPeriodFirst: 0, avgPeriodSecond: 0,
        avgYear: 0, avgMean: 0, yearMax: totalMax, passedYear: 0, semestersUsed: 0,
      },
    });
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
    WHERE st.classroom_id = ${meta.classroom_id} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const rows = (rowsResult.rows ?? []).map((row) => {
    const first = Number(row.t1 ?? 0);
    const second = Number(row.t2 ?? 0);
    return {
      studentId: row.id,
      fullName: row.full_name,
      nationalId: row.national_id,
      classNumber: row.class_number,
      first,
      second,
      // متوسط مجموع الفترتين داخل كل فصل دراسي
      periodAvgFirst: periodAverage(items, (row.v1 ?? {}) as GradeValues),
      periodAvgSecond: periodAverage(items, (row.v2 ?? {}) as GradeValues),
      // مجموع الفصلين (السنوي) والمتوسط بين الفصلين
      yearTotal: yearTotal({ first, second }),
      yearAvg: yearAverage({ first, second }),
    };
  });

  const count = rows.length;
  const avgOf = (pick: (r: (typeof rows)[number]) => number) =>
    count ? round2(rows.reduce((s, r) => s + pick(r), 0) / count) : 0;

  const gradedFirst = rows.filter((r) => r.first > 0).length;
  const gradedSecond = rows.filter((r) => r.second > 0).length;
  const semestersUsed = (gradedFirst > 0 ? 1 : 0) + (gradedSecond > 0 ? 1 : 0);
  const yearMaxValue = round2(totalMax * Math.max(1, semestersUsed || 1));

  return NextResponse.json({
    ok: true,
    unlinked: false,
    subject: {
      id: meta.id,
      name: meta.name,
      grade: meta.grade,
      section: meta.section,
      totalMax,
      passingScore,
      periodAvgMax,
    },
    rows,
    stats: {
      count,
      gradedFirst,
      gradedSecond,
      avgFirst: avgOf((r) => r.first),
      avgSecond: avgOf((r) => r.second),
      // متوسط مجموع الفترتين لكل فصل دراسي
      avgPeriodFirst: avgOf((r) => r.periodAvgFirst),
      avgPeriodSecond: avgOf((r) => r.periodAvgSecond),
      // متوسط مجموع الفصلين
      avgMean: avgOf((r) => r.yearAvg),
      // متوسط المجموع السنوي
      avgYear: avgOf((r) => r.yearTotal),
      yearMax: yearMaxValue,
      passedYear: rows.filter((r) => r.yearTotal >= passingScore * Math.max(1, semestersUsed || 1)).length,
      semestersUsed,
    },
  });
}
