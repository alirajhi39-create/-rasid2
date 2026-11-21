import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Incoming = {
  classroomId?: number;
  rows?: { fullName?: string; nationalId?: string; classNumber?: number | null; notes?: string }[];
};

/**
 * استيراد الطلاب دفعة واحدة:
 *  - من ملفات Excel (.xlsx / .xls) — يتم تحويلها إلى صفوف في المتصفح عبر مكتبة xlsx
 *  - من اللصق المباشر لكشوف نظام نور
 */
export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as Incoming;
    const classroomId = Number(body.classroomId);
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!Number.isFinite(classroomId)) {
      return NextResponse.json({ ok: false, error: "الرجاء تحديد الفصل المستهدف" }, { status: 400 });
    }
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "لا توجد صفوف للاستيراد" }, { status: 400 });
    }

    if (!(await ownsClassroom(classroomId, guard.session.uid))) {
      return NextResponse.json(
        { ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" },
        { status: 403 },
      );
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    // ترقيم تسلسلي يبدأ بعد آخر رقم في الفصل
    const maxRow = await db.execute<{ next: number | null }>(
      sql`SELECT MAX(class_number) AS next FROM students WHERE classroom_id = ${classroomId}`,
    );
    let counter = (maxRow.rows?.[0]?.next ?? 0) + 1;
    const seen = new Set<string>();

    for (const [index, row] of rows.entries()) {
      const fullName = String(row.fullName ?? "").replace(/\s+/g, " ").trim();
      if (!fullName || fullName.length < 3) {
        skipped++;
        if (errors.length < 8) errors.push(`الصف ${index + 1}: اسم غير صالح`);
        continue;
      }
      if (seen.has(fullName)) {
        skipped++;
        continue;
      }
      seen.add(fullName);

      const nationalId = String(row.nationalId ?? "").replace(/\D/g, "") || null;
      let classNumber: number | null = null;
      const rawNumber = row.classNumber;
      if (rawNumber !== null && rawNumber !== undefined && String(rawNumber).trim() !== "") {
        const parsed = Number(rawNumber);
        if (Number.isFinite(parsed)) classNumber = parsed;
      }
      if (classNumber === null) {
        classNumber = counter;
        counter++;
      }

      try {
        await db.execute(
          sql`INSERT INTO students (full_name, national_id, classroom_id, class_number, notes)
              VALUES (${fullName}, ${nationalId}, ${classroomId}, ${classNumber}, ${row.notes ?? null})`,
        );
        inserted++;
      } catch {
        skipped++;
        if (errors.length < 8) errors.push(`الصف ${index + 1}: تعذر الحفظ (تكرار الرقم أو البيانات)`);
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped,
      total: rows.length,
      errors,
      message: `تم استيراد ${inserted} طالب${skipped ? ` — تم تجاهل ${skipped}` : ""}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر الاستيراد",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
