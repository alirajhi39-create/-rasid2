import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
    };

    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "الرجاء إدخال اسم المستخدم وكلمة المرور" },
        { status: 400 },
      );
    }

    const result = await db.execute<{
      id: number;
      username: string;
      password_hash: string;
      full_name: string;
      role: string;
      active: boolean;
    }>(
      sql`SELECT id, username, password_hash, full_name, role, active FROM users WHERE username = ${username} LIMIT 1`,
    );

    const user = result.rows?.[0];
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    const token = await createSessionToken({
      uid: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    });

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role },
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
        error: "تعذر تسجيل الدخول",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
