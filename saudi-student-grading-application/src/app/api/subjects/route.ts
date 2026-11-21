import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";
import type { ScoreItem } from "@/db/schema";
import { computeTotalMax } from "@/lib/grades";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type SubjectRow = {
  id: number;
  name: string;
  classroom_id: number;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
  students_graded: number;
};

export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const classroomId = url.searchParams.get("classroomId");

  const conditions: ReturnType<typeof sql>[] = [sql`c.user_id = ${guard.session.uid}`];
  if (classroomId && Number.isFinite(Number(classroomId))) {
    conditions.push(sql`AND s.classroom_id = ${Number(classroomId)}`);
  }
  const where = sql.join(conditions, sql` `);

  const result = await db.execute<SubjectRow>(sql`
    SELECT s.id, s.name, s.classroom_id, s.items, s.total_max, s.passing_score,
      (SELECT count(*)::int FROM grades g WHERE g.subject_id = s.id) AS students_graded
    FROM subjects s
    JOIN classrooms c ON c.id = s.classroom_id
    WHERE ${where}
    ORDER BY s.name
  `);

  return NextResponse.json({ ok: true, subjects: result.rows ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      classroomId?: number;
      items?: ScoreItem[];
      passingScore?: number;
    };

    const name = (body.name ?? "").trim();
    const classroomId = Number(body.classroomId);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!name || !Number.isFinite(classroomId)) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال اسم المادة وتحديد الفصل" },
        { status: 400 },
      );
    }
    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "أضف خانة واحدة على الأقل لتوزيع الدرجات" },
        { status: 400 },
      );
    }
    if (!(await ownsClassroom(classroomId, guard.session.uid))) {
      return NextResponse.json({ ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" }, { status: 403 });
    }

    const cleaned: ScoreItem[] = items.map((item, index): ScoreItem => ({
      id: item.id || `it_${Date.now().toString(36)}_${index}`,
      label: String(item.label ?? `خانة ${index + 1}`).trim(),
      max: Math.max(0, Number(item.max) || 0),
      group: item.group === "final" ? "final" : "year",
      kind: item.kind ?? "custom",
      period: item.period === "p2" ? "p2" : "p1",
    }));

    const totalMax = computeTotalMax(cleaned);
    if (totalMax <= 0) {
      return NextResponse.json(
        { ok: false, error: "يجب تحديد الدرجة العظمى لخانة واحدة على الأقل" },
        { status: 400 },
      );
    }

    const passingScore = Number(body.passingScore);
    const finalPassing = Number.isFinite(passingScore) && passingScore > 0 ? passingScore : Math.round(totalMax / 2);

    const inserted = await db.execute<SubjectRow>(sql`
      INSERT INTO subjects (name, classroom_id, items, total_max, passing_score)
      VALUES (${name}, ${classroomId}, ${JSON.stringify(cleaned)}::jsonb, ${totalMax}, ${finalPassing})
      RETURNING id, name, classroom_id, items, total_max, passing_score
    `);

    return NextResponse.json({ ok: true, subject: inserted.rows?.[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إضافة المادة",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
