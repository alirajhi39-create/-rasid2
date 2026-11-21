import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import { round2, yearAverage, yearTotal } from "@/lib/grades";
import type { ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * =====================================================================
 *  GET /api/grades/summary?subjectId=1
 *  ملخص الفصلين الدراسيين: مجموع الفصل الأول + مجموع الفصل الثاني
 *  + المجموع الكلي للعام + المتوسط
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
  if (!(await ownsSubject(subjectId, guard.session.uid)).owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  const metaResult = await db.execute<{
    id: number;
    name: string;
    items: ScoreItem[];
    total_max: string;
    passing_score: string;
    grade: string;
    section: string;
    classroom_id: number;
  }>(sql`
    SELECT s.id, s.name, s.items, s.total_max, s.passing_score,
           c.grade, c.section, s.classroom_id
    FROM subjects s JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${subjectId} LIMIT 1
  `);
  const meta = metaResult.rows?.[0];
  if (!meta) {
    return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
  }

  const rowsResult = await db.execute<{
    id: number;
    full_name: string;
    national_id: string | null;
    class_number: number | null;
    t1: string | null;
    t2: string | null;
  }>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g1.total AS t1, g2.total AS t2
    FROM students st
    LEFT JOIN grades g1 ON g1.student_id = st.id AND g1.subject_id = ${subjectId} AND g1.semester = 'first'
    LEFT JOIN grades g2 ON g2.student_id = st.id AND g2.subject_id = ${subjectId} AND g2.semester = 'second'
    WHERE st.classroom_id = ${meta.classroom_id} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  const totalMax = Number(meta.total_max);
  const passingScore = Number(meta.passing_score);

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
      yearTotal: yearTotal({ first, second }),
      yearAvg: yearAverage({ first, second }),
    };
  });

  const count = rows.length;
  const avgFirst = count ? round2(rows.reduce((s, r) => s + r.first, 0) / count) : 0;
  const avgSecond = count ? round2(rows.reduce((s, r) => s + r.second, 0) / count) : 0;
  const avgYear = count ? round2(rows.reduce((s, r) => s + r.yearTotal, 0) / count) : 0;
  const avgMean = count ? round2(rows.reduce((s, r) => s + r.yearAvg, 0) / count) : 0;

  const gradedFirst = rows.filter((r) => r.first > 0).length;
  const gradedSecond = rows.filter((r) => r.second > 0).length;
  const semestersUsed = (gradedFirst > 0 ? 1 : 0) + (gradedSecond > 0 ? 1 : 0);
  const yearMaxValue = round2(totalMax * Math.max(1, semestersUsed || 1));

  return NextResponse.json({
    ok: true,
    subject: {
      id: meta.id,
      name: meta.name,
      grade: meta.grade,
      section: meta.section,
      totalMax,
      passingScore,
    },
    rows,
    stats: {
      count,
      gradedFirst,
      gradedSecond,
      avgFirst,
      avgSecond,
      avgYear,
      avgMean,
      yearMax: yearMaxValue,
      passedYear: rows.filter((r) => r.yearTotal >= passingScore * Math.max(1, semestersUsed || 1)).length,
      semestersUsed,
    },
  });
}
