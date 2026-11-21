import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StudentRow = {
  id: number;
  full_name: string;
  national_id: string | null;
  classroom_id: number;
  class_number: number | null;
  notes: string | null;
  active: boolean;
  grade: string;
  section: string;
  stage: string;
};

export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const classroomId = url.searchParams.get("classroomId");
  const search = (url.searchParams.get("search") ?? "").trim();

  // عزل البيانات: الطالب يجب أن يكون في فصل يملكه المعلم الحالي
  const conditions: string[] = [`c.user_id = ${guard.session.uid}`];
  if (classroomId && Number.isFinite(Number(classroomId))) {
    conditions.push(`s.classroom_id = ${Number(classroomId)}`);
  }
  if (search) {
    const safe = search.replace(/'/g, "''");
    conditions.push(`(s.full_name ILIKE '%${safe}%' OR COALESCE(s.national_id,'') ILIKE '%${safe}%')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute<StudentRow>(sql.raw(`
    SELECT s.id, s.full_name, s.national_id, s.classroom_id, s.class_number, s.notes, s.active,
           c.grade, c.section, c.stage
    FROM students s
    JOIN classrooms c ON c.id = s.classroom_id
    ${where}
    ORDER BY c.stage, c.grade, c.section, COALESCE(s.class_number, 999999), s.full_name
  `));

  return NextResponse.json({ ok: true, students: result.rows ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      nationalId?: string;
      classroomId?: number;
      classNumber?: number | null;
      notes?: string;
    };

    const fullName = (body.fullName ?? "").trim();
    const classroomId = Number(body.classroomId);
    if (!fullName || !Number.isFinite(classroomId)) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال اسم الطالب وتحديد الفصل" },
        { status: 400 },
      );
    }

    const nationalId = (body.nationalId ?? "").trim() || null;
    if (nationalId && !/^\d{8,12}$/.test(nationalId)) {
      return NextResponse.json(
        { ok: false, error: "رقم الهوية / السجل المدني يجب أن يكون من ٨ إلى ١٢ رقماً" },
        { status: 400 },
      );
    }
    if (!(await ownsClassroom(classroomId, guard.session.uid))) {
      return NextResponse.json({ ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" }, { status: 403 });
    }

    let classNumber = body.classNumber;
    if (classNumber === null || classNumber === undefined || !Number.isFinite(Number(classNumber))) {
      const maxRow = await db.execute<{ next: number | null }>(
        sql`SELECT MAX(class_number) AS next FROM students WHERE classroom_id = ${classroomId}`,
      );
      const next = maxRow.rows?.[0]?.next;
      classNumber = (next ?? 0) + 1;
    }

    const inserted = await db.execute<StudentRow>(sql`
      INSERT INTO students (full_name, national_id, classroom_id, class_number, notes)
      VALUES (${fullName}, ${nationalId}, ${classroomId}, ${Number(classNumber)}, ${body.notes ?? null})
      RETURNING id, full_name, national_id, classroom_id, class_number, notes, active
    `);

    return NextResponse.json({ ok: true, student: inserted.rows?.[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إضافة الطالب",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
