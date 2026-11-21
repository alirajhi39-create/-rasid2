import { initDatabase } from "@/db/init";
import { ensureDatabase } from "@/lib/bootstrap";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handler() {
  try {
    await ensureDatabase();
    const result = await initDatabase();

    const tables = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );

    return Response.json({
      ok: true,
      message: "تم تهيئة قاعدة البيانات بنجاح — جميع الجداول جاهزة",
      tables: (tables.rows ?? []).map((r) => r.table_name),
      steps: result.steps,
      userCount: result.userCount,
      needsFirstAccount: result.needsFirstAccount,
      provider: /neon/i.test(process.env.DATABASE_URL ?? "") ? "Neon PostgreSQL" : "PostgreSQL",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "فشل تهيئة قاعدة البيانات",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handler();
}

export async function POST() {
  return handler();
}
