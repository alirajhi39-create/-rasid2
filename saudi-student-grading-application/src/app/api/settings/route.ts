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
  "pct_excellent",
  "pct_vgood",
  "pct_good",
  "pct_pass",
  "teacher_signature",
  "headmaster_signature",
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
  pctExcellent: number;
  pctVgood: number;
  pctGood: number;
  pctPass: number;
  teacherSignature: string | null;
  headmasterSignature: string | null;
};

const CAMEL: Record<(typeof FIELDS)[number], keyof SettingsShape> = {
  school_name: "schoolName",
  administration: "administration",
  ministry_office: "ministryOffice",
  teacher_name: "teacherName",
  academic_year: "academicYear",
  semester: "semester",
  headmaster_name: "headmasterName",
  pct_excellent: "pctExcellent",
  pct_vgood: "pctVgood",
  pct_good: "pctGood",
  pct_pass: "pctPass",
  teacher_signature: "teacherSignature",
  headmaster_signature: "headmasterSignature",
};

/* حدود النِّسب المئوية للتقديرات (ممتاز / جيد جداً / جيد / مقبول) */
const PCT_FIELDS = ["pct_excellent", "pct_vgood", "pct_good", "pct_pass"] as const;
const PCT_CAMEL: Record<(typeof PCT_FIELDS)[number], string> = {
  pct_excellent: "pctExcellent",
  pct_vgood: "pctVgood",
  pct_good: "pctGood",
  pct_pass: "pctPass",
};

/** تحويل صف قاعدة البيانات (snake_case) إلى شكل الواجهة (camelCase) */
function toSettingsShape(row: Record<string, unknown> | undefined): SettingsShape {
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : String(v ?? fallback));
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    id: num(row?.id, 1),
    schoolName: str(row?.school_name),
    administration: str(row?.administration),
    ministryOffice: str(row?.ministry_office, "وزارة التعليم"),
    teacherName: str(row?.teacher_name),
    academicYear: str(row?.academic_year),
    semester: str(row?.semester),
    headmasterName: str(row?.headmaster_name),
    pctExcellent: num(row?.pct_excellent, 90),
    pctVgood: num(row?.pct_vgood, 80),
    pctGood: num(row?.pct_good, 65),
    pctPass: num(row?.pct_pass, 50),
    teacherSignature: typeof row?.teacher_signature === "string" ? row.teacher_signature : null,
    headmasterSignature:
      typeof row?.headmaster_signature === "string" ? row.headmaster_signature : null,
  };
}

export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const result = await db.execute<Record<string, unknown>>(
    sql`SELECT * FROM app_settings WHERE id = 1 LIMIT 1`,
  );
  const raw = result.rows?.[0];
  if (!raw) {
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
        pctExcellent: 90,
        pctVgood: 80,
        pctGood: 65,
        pctPass: 50,
      },
    });
  }
  return NextResponse.json({
    ok: true,
    settings: toSettingsShape(raw),
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    emailProvider: process.env.RESEND_API_KEY ? "Resend" : null,
  });
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
      if (typeof value !== "string") continue;
      const clean = value.trim();

      if (clean === "") {
        // الإدارة يمكن إفراغها لإخفائها من الترويسة
        if (field === "administration") updates.push(`${field} = ''`);
        continue;
      }
      // الصور (base64) تُتحقق من الحجم وتحفظ كنص خام
      if (field === "teacher_signature" || field === "headmaster_signature") {
        if (!clean.startsWith("data:image/")) {
          return NextResponse.json(
            { ok: false, error: "التوقيع يجب أن يكون صورة صالحة (PNG أو JPG)" },
            { status: 400 },
          );
        }
        if (clean.length > 600_000) {
          return NextResponse.json(
            { ok: false, error: "حجم صورة التوقيع كبير — تصغّرها إلى ٦٠٠ بكسل عرضاً كحد أقصى" },
            { status: 400 },
          );
        }
        updates.push(`${field} = '${clean.replace(/'/g, "''")}'`);
        continue;
      }

      updates.push(`${field} = '${clean.replace(/'/g, "''")}'`);
    }

    // السماح بمسح التوقيع (إفراغ الحقل)
    for (const field of ["teacher_signature", "headmaster_signature"] as const) {
      const raw = body[CAMEL[field]];
      if (typeof raw === "string" && raw.trim() === "") {
        updates.push(`${field} = NULL`);
      }
    }
    // حدود النِّسب: تُتحقَّق منطقياً وتُرتَّب تصاعدياً
    const pctValues: Record<string, number> = {};
    for (const field of PCT_FIELDS) {
      const raw = body[PCT_CAMEL[field]];
      if (raw === undefined || raw === null || raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return NextResponse.json(
          { ok: false, error: "النِّسب المئوية يجب أن تكون بين ٠ و ١٠٠" },
          { status: 400 },
        );
      }
      pctValues[field] = Math.round(value);
    }
    if (Object.keys(pctValues).length >= 2) {
      const excellent = pctValues.pct_excellent ?? 90;
      const vgood = pctValues.pct_vgood ?? 80;
      const good = pctValues.pct_good ?? 65;
      const pass = pctValues.pct_pass ?? 50;
      if (!(excellent >= vgood && vgood >= good && good >= pass)) {
        return NextResponse.json(
          { ok: false, error: "يجب أن تكون النسب متسلسلة: ممتاز ≥ جيد جداً ≥ جيد ≥ مقبول" },
          { status: 400 },
        );
      }
      for (const [field, value] of Object.entries(pctValues)) {
        updates.push(`${field} = ${value}`);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: false, error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }
    await db.execute(
      sql.raw(`UPDATE app_settings SET ${updates.join(", ")}, updated_at = now() WHERE id = 1`),
    );
    const result = await db.execute<Record<string, unknown>>(
      sql`SELECT * FROM app_settings WHERE id = 1`,
    );
    return NextResponse.json({
      ok: true,
      settings: toSettingsShape(result.rows?.[0]),
      message: "تم حفظ الإعدادات",
    });
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
