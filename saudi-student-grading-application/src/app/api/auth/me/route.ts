import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, user: null }, { status: 401 });

  // جلب البيانات المحدّثة من قاعدة البيانات
  try {
    await ensureDatabase();
    const result = await db.execute<{
      id: number;
      username: string;
      full_name: string;
      role: string;
      email: string | null;
    }>(
      sql`SELECT id, username, full_name, role, email FROM users WHERE id = ${session.uid} LIMIT 1`,
    );
    const user = result.rows?.[0];
    if (!user) return NextResponse.json({ ok: false, user: null }, { status: 401 });

    return NextResponse.json({
      ok: true,
      user: {
        uid: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        email: user.email,
      },
    });
  } catch {
    return NextResponse.json({
      ok: true,
      user: {
        uid: session.uid,
        username: session.username,
        fullName: session.fullName,
        role: session.role,
        email: null,
      },
    });
  }
}
