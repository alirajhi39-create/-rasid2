import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ownsClassroom, ownsStudent } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsStudent(studentId, guard.session.uid))) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذا الطالب ليس من طلابك" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    nationalId?: string | null;
    classroomId?: number;
    classNumber?: number | null;
    guardianPhone?: string;
    notes?: string | null;
  };

  const fullName = (body.fullName ?? "").trim();
  const classroomId = Number(body.classroomId);
  if (!fullName || !Number.isFinite(classroomId)) {
    return NextResponse.json({ ok: false, error: "بيانات غير مكتملة" }, { status: 400 });
  }
  // التحقق من الفصل الجديد عند نقل الطالب
  if (!(await ownsClassroom(classroomId, guard.session.uid))) {
    return NextResponse.json({ ok: false, error: "غير مصرح — الفصل الجديد ليس من فصولك" }, { status: 403 });
  }

  const nationalId = (body.nationalId ?? "").trim() || null;
  const guardianPhone =
    body.guardianPhone === undefined
      ? null
      : String(body.guardianPhone).replace(/[^\d+]/g, "").slice(0, 20) || null;
  const classNumber =
    body.classNumber === null || body.classNumber === undefined
      ? null
      : Number(body.classNumber);

  await db.execute(
    sql`UPDATE students SET full_name = ${fullName}, national_id = ${nationalId},
        classroom_id = ${classroomId}, class_number = ${classNumber},
        guardian_phone = ${guardianPhone},
        notes = ${body.notes ?? null}
        WHERE id = ${studentId}`,
  );

  return NextResponse.json({ ok: true, message: "تم تحديث بيانات الطالب" });
}

export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsStudent(studentId, guard.session.uid))) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذا الطالب ليس من طلابك" }, { status: 403 });
  }

  await db.execute(sql`DELETE FROM students WHERE id = ${studentId}`);
  return NextResponse.json({ ok: true, message: "تم حذف الطالب" });
}
