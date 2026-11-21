import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FIELDS = [
  "school_name",
  "administration",
  "ministry_office",
  "teacher_name",
  "academic_year",
  "semester",
  "headmaster_name",
] as const;

type SettingsShape = {
  id: number;
  schoolName: string;
  administration: string;
  ministryOffice: string;
  teacherName: string;
  academicYear: string;
  semester: string;
  headmasterName: string;
};

const CAMEL: Record<(typeof FIELDS)[number], keyof SettingsShape> = {
  school_name: "schoolName",
  administration: "administration",
  ministry_office: "ministryOffice",
  teacher_name: "teacherName",
  academic_year: "academicYear",
  semester: "semester",
  headmaster_name: "headmasterName",
};

export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const result = await db.execute<SettingsShape>(sql`SELECT * FROM app_settings WHERE id = 1 LIMIT 1`);
  const row = result.rows?.[0];
  if (!row) {
    await db.execute(sql`INSERT INTO app_settings (id) VALUES (1)`);
    return NextResponse.json({
      ok: true,
      settings: {
        id: 1,
        schoolName: "مدرسة الأمير عبدالله بن عبدالعزيز",
        administration: "إدارة التعليم - منطقة الرياض",
        ministryOffice: "وزارة التعليم",
        teacherName: "معلم المادة",
        academicYear: "1447 هـ",
        semester: "الفصل الدراسي الأول",
        headmasterName: "مدير المدرسة",
      },
    });
  }
  return NextResponse.json({ ok: true, settings: row });
}

export async function PUT(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
    const updates: string[] = [];
    for (const field of FIELDS) {
      const value = body[CAMEL[field]];
      if (typeof value === "string" && value.trim() !== "") {
        updates.push(`${field} = '${value.replace(/'/g, "''").trim()}'`);
      }
    }
    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }
    await db.execute(
      sql.raw(`UPDATE app_settings SET ${updates.join(", ")}, updated_at = now() WHERE id = 1`),
    );
    const result = await db.execute<SettingsShape>(sql`SELECT * FROM app_settings WHERE id = 1`);
    return NextResponse.json({ ok: true, settings: result.rows?.[0], message: "تم حفظ الإعدادات" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر حفظ الإعدادات",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
