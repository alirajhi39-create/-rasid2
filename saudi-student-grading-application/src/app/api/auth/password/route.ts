import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PUT — تحديث بيانات الحساب الحالي:
 *  - الاسم الكامل
 *  - اسم المستخدم (اختياري)
 *  - كلمة المرور (تتطلب كلمة المرور الحالية)
 * لا تُعاد أي كلمات مرور في الاستجابة إطلاقاً.
 */
export async function PUT(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
      fullName?: string;
      username?: string;
    };

    const fullName = (body.fullName ?? "").replace(/\s+/g, " ").trim();
    const newUsername = (body.username ?? "").trim().toLowerCase();
    const current = body.currentPassword ?? "";
    const next = body.newPassword ?? "";

    const result = await db.execute<{ password_hash: string }>(
      sql`SELECT password_hash FROM users WHERE id = ${guard.session.uid} LIMIT 1`,
    );
    const row = result.rows?.[0];
    if (!row) return NextResponse.json({ ok: false, error: "الحساب غير موجود" }, { status: 404 });

    const updates: string[] = [];

    if (fullName) {
      if (fullName.length < 3) {
        return NextResponse.json({ ok: false, error: "الرجاء إدخال الاسم الكامل" }, { status: 400 });
      }
      updates.push(`full_name = '${fullName.replace(/'/g, "''")}'`);
    }

    if (newUsername && newUsername !== guard.session.username) {
      if (!/^[a-zA-Z0-9._-]{3,24}$/.test(newUsername)) {
        return NextResponse.json(
          { ok: false, error: "اسم المستخدم يجب أن يكون بالإنجليزية من ٣ إلى ٢٤ حرفاً" },
          { status: 400 },
        );
      }
      const taken = await db.execute<{ id: number }>(
        sql`SELECT id FROM users WHERE lower(username) = ${newUsername} AND id <> ${guard.session.uid} LIMIT 1`,
      );
      if (taken.rows?.[0]) {
        return NextResponse.json({ ok: false, error: "اسم المستخدم مستخدم مسبقاً" }, { status: 409 });
      }
      updates.push(`username = '${newUsername.replace(/'/g, "''")}'`);
    }

    if (next) {
      const valid = await bcrypt.compare(current, row.password_hash);
      if (!valid) {
        return NextResponse.json({ ok: false, error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
      }
      if (next.length < 6) {
        return NextResponse.json(
          { ok: false, error: "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل" },
          { status: 400 },
        );
      }
      const hash = await bcrypt.hash(next, 10);
      updates.push(`password_hash = '${hash.replace(/'/g, "''")}'`);
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    await db.execute(
      sql.raw(`UPDATE users SET ${updates.join(", ")}, updated_at = now() WHERE id = ${guard.session.uid}`),
    );

    return NextResponse.json({ ok: true, message: "تم تحديث بيانات الحساب بنجاح" });
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
