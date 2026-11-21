import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * =====================================================================
 *  تسجيل حساب معلم جديد — متاح لأي معلم
 *  أول حساب يُنشأ في النظام يحصل تلقائياً على صلاحية مدير النظام.
 *  لا تُعرض أي كلمات مرور في أي مكان ولا تُخزَّن كنص صريح (bcrypt فقط).
 * =====================================================================
 */
export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      username?: string;
      password?: string;
      schoolName?: string;
      administration?: string;
      headmasterName?: string;
    };

    const fullName = (body.fullName ?? "").replace(/\s+/g, " ").trim();
    const username = (body.username ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (fullName.length < 3 || fullName.split(" ").length < 2) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال الاسم الثلاثي أو الرباعي للمعلم" },
        { status: 400 },
      );
    }
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
      return NextResponse.json(
        { ok: false, error: "اسم المستخدم يجب أن يكون بالإنجليزية من ٣ إلى ٢٤ حرفاً (أحرف وأرقام و . _ -)" },
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
      return NextResponse.json(
        { ok: false, error: "اسم المستخدم مستخدم مسبقاً — اختر اسماً آخر" },
        { status: 409 },
      );
    }

    // أول حساب في النظام = مدير النظام
    const countResult = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM users`);
    const isFirst = Number(countResult.rows?.[0]?.count ?? "0") === 0;
    const role = isFirst ? "admin" : "teacher";

    const hash = await bcrypt.hash(password, 10);
    const inserted = await db.execute<{ id: number; username: string; full_name: string; role: string }>(sql`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES (${username}, ${hash}, ${fullName}, ${role})
      RETURNING id, username, full_name, role
    `);
    const user = inserted.rows?.[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "تعذر إنشاء الحساب" }, { status: 500 });
    }

    // بيانات المدرسة (مشتركة بين جميع المعلمين) — تُحدَّث فقط عند تقديمها
    const schoolName = (body.schoolName ?? "").trim();
    const administration = (body.administration ?? "").trim();
    const headmasterName = (body.headmasterName ?? "").trim();

    if (schoolName || administration || headmasterName) {
      const sets: string[] = [];
      if (schoolName) sets.push(`school_name = '${schoolName.replace(/'/g, "''")}'`);
      if (administration) sets.push(`administration = '${administration.replace(/'/g, "''")}'`);
      if (headmasterName) sets.push(`headmaster_name = '${headmasterName.replace(/'/g, "''")}'`);
      if (sets.length) {
        await db.execute(
          sql.raw(`UPDATE app_settings SET ${sets.join(", ")}, updated_at = now() WHERE id = 1`),
        );
      }
    }

    const token = await createSessionToken({
      uid: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    });

    const response = NextResponse.json({
      ok: true,
      isFirstAccount: isFirst,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role },
      message: isFirst
        ? "تم إنشاء حسابك كمدير للنظام — مرحباً بك"
        : "تم إنشاء حسابك بنجاح — مرحباً بك",
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إنشاء الحساب",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
