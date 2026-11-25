import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/auth/reset  — إعادة تعيين كلمة المرور بالرمز المؤقت
 * يستقبل { token, password } ويحدّث كلمة المرور ويستهلك الرمز.
 */
export async function POST(request: Request) {
  try {
    await ensureDatabase().catch(() => undefined);
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      password?: string;
    };

    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "رابط الاستعادة غير صالح أو منتهي" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل" },
        { status: 400 },
      );
    }

    const result = await db.execute<{ id: number; user_id: number; expires_at: string }>(sql`
      SELECT id, user_id, expires_at::text AS expires_at
      FROM password_resets
      WHERE token_hash = ${hashToken(token)}
        AND used_at IS NULL
        AND expires_at > now()
      ORDER BY id DESC
      LIMIT 1
    `);
    const reset = result.rows?.[0];

    if (!reset) {
      return NextResponse.json(
        { ok: false, error: "رابط الاستعادة غير صالح أو انتهت صلاحيته" },
        { status: 400 },
      );
    }

    const hash = await bcrypt.hash(password, 10);

    // تحديث كلمة المرور + استهلاك الرمز (بدون معاملات — آمن في Neon HTTP)
    await db.execute(
      sql`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE id = ${reset.user_id}`,
    );
    await db.execute(sql`UPDATE password_resets SET used_at = now() WHERE id = ${reset.id}`);
    // إلغاء بقية الرموز المفتوحة لنفس الحساب
    await db.execute(
      sql`UPDATE password_resets SET used_at = now()
          WHERE user_id = ${reset.user_id} AND used_at IS NULL`,
    );

    return NextResponse.json({
      ok: true,
      message: "تم إعادة تعيين كلمة المرور بنجاح — يمكنك تسجيل الدخول الآن",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إعادة تعيين كلمة المرور",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
