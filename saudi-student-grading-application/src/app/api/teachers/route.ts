import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin, requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type TeacherRow = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  created_at: string;
  classrooms_count: number;
  students_count: number;
};

/** GET — قائمة المعلمين (متاحة للمدير فقط) */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const result = await db.execute<TeacherRow>(sql`
    SELECT u.id, u.username, u.full_name, u.role, u.created_at::text AS created_at,
      (SELECT count(*)::int FROM classrooms c WHERE c.user_id = u.id) AS classrooms_count,
      (SELECT count(*)::int FROM students s JOIN classrooms c ON c.id = s.classroom_id
        WHERE c.user_id = u.id) AS students_count
    FROM users u
    ORDER BY u.role = 'admin' DESC, u.created_at
  `);

  return NextResponse.json({ ok: true, teachers: result.rows ?? [], me: guard.session.uid });
}

/** POST — إضافة معلم جديد يدوياً (المدير فقط) */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      username?: string;
      password?: string;
    };

    const fullName = (body.fullName ?? "").replace(/\s+/g, " ").trim();
    const username = (body.username ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (fullName.length < 3) {
      return NextResponse.json({ ok: false, error: "الرجاء إدخال اسم المعلم" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      return NextResponse.json(
        { ok: false, error: "اسم المستخدم يجب أن يكون بالإنجليزية من ٣ إلى ٢٤ حرفاً" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" },
        { status: 400 },
      );
    }

    const exists = await db.execute<{ id: number }>(
      sql`SELECT id FROM users WHERE lower(username) = ${username} LIMIT 1`,
    );
    if (exists.rows?.[0]) {
      return NextResponse.json({ ok: false, error: "اسم المستخدم مستخدم مسبقاً" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      sql`INSERT INTO users (username, password_hash, full_name, role)
          VALUES (${username}, ${hash}, ${fullName}, ${"teacher"})`,
    );

    return NextResponse.json({ ok: true, message: "تم إضافة المعلم بنجاح" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إضافة المعلم",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/** DELETE — حذف حساب معلم وكل بياناته (المدير فقط) */
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (id === guard.session.uid) {
    return NextResponse.json(
      { ok: false, error: "لا يمكنك حذف حسابك الحالي" },
      { status: 400 },
    );
  }

  const target = await db.execute<{ role: string }>(sql`SELECT role FROM users WHERE id = ${id} LIMIT 1`);
  if (!target.rows?.[0]) {
    return NextResponse.json({ ok: false, error: "الحساب غير موجود" }, { status: 404 });
  }
  if (target.rows[0].role === "admin") {
    return NextResponse.json(
      { ok: false, error: "لا يمكن حذف حساب مدير النظام" },
      { status: 400 },
    );
  }

  await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
  return NextResponse.json({ ok: true, message: "تم حذف الحساب وكل بياناته" });
}

/** PUT — تعديل اسم معلم (المدير فقط) */
export async function PUT(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: number; fullName?: string };
    const id = Number(body.id);
    const fullName = (body.fullName ?? "").replace(/\s+/g, " ").trim();

    if (!Number.isFinite(id) || !fullName) {
      return NextResponse.json({ ok: false, error: "بيانات غير مكتملة" }, { status: 400 });
    }
    if (id !== guard.session.uid && guard.session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 403 });
    }

    await db.execute(sql`UPDATE users SET full_name = ${fullName}, updated_at = now() WHERE id = ${id}`);
    return NextResponse.json({ ok: true, message: "تم تحديث الاسم" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر التحديث",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
