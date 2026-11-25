import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * =====================================================================
 *  POST /api/auth/forgot  — طلب استعادة كلمة المرور عبر البريد الإلكتروني
 *
 *  يُنشئ رابطاً مؤقتاً صالحاً ٣٠ دقيقة ويرسله إلى بريد المعلم.
 *  يعتمد على متغير البيئة RESEND_API_KEY (خدمة Resend — مجانية ١٠٠ رسالة/يوم).
 *  إن لم يُضبط المتغير تُعاد رسالة واضحة دون كشف أي بيانات حساس.
 * =====================================================================
 */

const RESET_TTL_MINUTES = 30;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    await ensureDatabase().catch(() => undefined);
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const identifier = (body.email ?? "").trim().toLowerCase();

    if (!identifier) {
      return NextResponse.json(
        { ok: false, error: "أدخل اسم المستخدم أو البريد الإلكتروني" },
        { status: 400 },
      );
    }

    // نبحث بالبريد المسجل أو باسم المستخدم — الاستجابة موحدة دائماً (لا كشف الحسابات)
    const userResult = await db.execute<{
      id: number;
      username: string;
      full_name: string;
      email: string | null;
    }>(sql`
      SELECT id, username, full_name, email FROM users
      WHERE lower(COALESCE(email, '')) = ${identifier}
         OR lower(username) = ${identifier}
      LIMIT 1
    `);
    const user = userResult.rows?.[0];

    const generic = {
      ok: true,
      message:
        "إذا كان هناك حساب بهذا الاسم فسيصلك رابط استعادة كلمة المرور على البريد المسجل خلال دقائق.",
    };

    if (!user) return NextResponse.json(generic);

    // الحساب موجود لكن لا يوجد بريد مسغل — نطلب تسجيله أولاً
    const recipient = (user.email ?? "").trim();
    if (!recipient) {
      return NextResponse.json({
        ok: true,
        message:
          "هذا الحساب لا يملك برجعاً إلكترونياً مسجلاً — سجّله من صفحة الإعدادات ثم أعد المحاولة، أو تواصل مع مدير النظام لإعادة تعيين كلمة المرور.",
        needsEmail: true,
      });
    }

    // إنشاء رمز عشوائي آمن — نخزّن تجزئته فقط
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    await db.execute(
      sql`INSERT INTO password_resets (user_id, token_hash, expires_at)
          VALUES (${user.id}, ${hashToken(token)}, ${expiresAt.toISOString()})`,
    );

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_URL &&
        `https://${process.env.VERCEL_URL}` ||
      "http://localhost:3000";
    const resetUrl = `${String(appUrl).replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // بدون مفتاح بريد نُعيد الرابط في وضع التطوير فقط لتسهيل الاختبار
      return NextResponse.json({
        ...generic,
        devLink: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
        note:
          process.env.NODE_ENV !== "production"
            ? "ضع RESEND_API_KEY لتفعيل إرسال البريد فعلياً"
            : undefined,
      });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "رَصْد <onboarding@resend.dev>",
        to: [recipient],
        subject: "استعادة كلمة المرور — نظام رَصْد",
        html: `
          <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#0f172a">
            <h2 style="color:#0b3d26">استعادة كلمة المرور</h2>
            <p>مرحباً ${user.full_name}،</p>
            <p>استلمت هذا الطلب لاستعادة كلمة مرور حسابك في نظام رَصْد.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}"
                 style="background:#1a64ef;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">
                إعادة تعيين كلمة المرور
              </a>
            </p>
            <p style="font-size:13px;color:#64748b">
              الرابط صالح لمدة ${RESET_TTL_MINUTES} دقيقة فقط. إن لم تطلب ذلك تجاهل هذه الرسالة.
            </p>
            <p style="font-size:13px;color:#64748b">${resetUrl}</p>
          </div>`,
      }),
    });

    if (!emailResponse.ok) {
      const detail = await emailResponse.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "تعذر إرسال البريد الإلكتروني",
          details: detail.slice(0, 200),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...generic, sentTo: recipient });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر معالجة الطلب",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/** تصدير الدالة لاستخدامها في مسار إعادة التعيين */
export { hashToken, RESET_TTL_MINUTES };
