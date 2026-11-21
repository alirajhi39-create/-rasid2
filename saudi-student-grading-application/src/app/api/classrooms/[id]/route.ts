import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ownsClassroom } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const classroomId = Number(id);
  if (!Number.isFinite(classroomId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsClassroom(classroomId, guard.session.uid))) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    grade?: string;
    section?: string;
    stage?: string;
  };
  const grade = (body.grade ?? "").trim();
  const section = (body.section ?? "").trim();
  const stage = (body.stage ?? "").trim();

  if (!grade || !section) {
    return NextResponse.json({ ok: false, error: "الرجاء تحديد الصف والفصل" }, { status: 400 });
  }

  await db.execute(
    sql`UPDATE classrooms SET grade = ${grade}, section = ${section}, stage = ${stage} WHERE id = ${classroomId}`,
  );
  return NextResponse.json({ ok: true, message: "تم تحديث الفصل" });
}

export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const classroomId = Number(id);
  if (!Number.isFinite(classroomId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsClassroom(classroomId, guard.session.uid))) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" }, { status: 403 });
  }

  await db.execute(sql`DELETE FROM classrooms WHERE id = ${classroomId}`);
  return NextResponse.json({ ok: true, message: "تم حذف الفصل وكل ما يتعلق به" });
}
