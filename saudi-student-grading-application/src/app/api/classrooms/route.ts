import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClassroomRow = {
  id: number;
  grade: string;
  section: string;
  stage: string;
  students_count: number;
  subjects_count: number;
};

export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  // كل معلم يرى فصوله الخاصة فقط
  const result = await db.execute<ClassroomRow>(sql`
    SELECT c.id, c.grade, c.section, c.stage,
      (SELECT count(*)::int FROM students s WHERE s.classroom_id = c.id) AS students_count,
      (SELECT count(*)::int FROM subjects sub WHERE sub.classroom_id = c.id) AS subjects_count
    FROM classrooms c
    WHERE c.user_id = ${guard.session.uid}
    ORDER BY c.stage, c.grade, c.section
  `);

  return NextResponse.json({ ok: true, classrooms: result.rows ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      grade?: string;
      section?: string;
      stage?: string;
    };
    const grade = (body.grade ?? "").trim();
    const section = (body.section ?? "").trim();
    const stage = (body.stage ?? "ابتدائي").trim();

    if (!grade || !section) {
      return NextResponse.json({ ok: false, error: "الرجاء تحديد الصف والفصل" }, { status: 400 });
    }

    const exists = await db.execute<{ id: number }>(
      sql`SELECT id FROM classrooms WHERE grade = ${grade} AND section = ${section} AND user_id = ${guard.session.uid} LIMIT 1`,
    );
    if (exists.rows?.[0]) {
      return NextResponse.json({ ok: false, error: "هذا الفصل موجود مسبقاً" }, { status: 409 });
    }

    const inserted = await db.execute<ClassroomRow>(
      sql`INSERT INTO classrooms (grade, section, stage, user_id)
          VALUES (${grade}, ${section}, ${stage}, ${guard.session.uid})
          RETURNING id, grade, section, stage`,
    );

    return NextResponse.json({ ok: true, classroom: inserted.rows?.[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إضافة الفصل",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
