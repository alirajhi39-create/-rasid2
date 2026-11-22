import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";
import type { ScoreItem } from "@/db/schema";
import { computeTotalMax, normalizeItems } from "@/lib/grades";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type SubjectRow = {
  id: number;
  name: string;
  classroom_id: number | null;
  grade: string | null;
  section: string | null;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
  students_graded: number;
};

/** تنظيف وتوحيد الخانات الواردة */
function cleanItems(items: ScoreItem[]): ScoreItem[] {
  return normalizeItems(items).map((item, index): ScoreItem => ({
    id: item.id || `it_${Date.now().toString(36)}_${index}`,
    label: String(item.label ?? `خانة ${index + 1}`).trim(),
    max: Math.max(0, Number(item.max) || 0),
    group: item.group,
    kind: item.kind ?? "custom",
    period: item.period,
  }));
}

/**
 * GET /api/subjects
 *   ?classroomId=1  → مواد هذا الفصل فقط (لا شيء آخر)
 *   ?unlinked=1     → المواد غير المرتبطة بفصل
 *   (بدون معامل)    → كل مواد المعلم
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const classroomId = url.searchParams.get("classroomId");
  const unlinked = url.searchParams.get("unlinked");

  const conditions: ReturnType<typeof sql>[] = [sql`AND s.user_id = ${guard.session.uid}`];
  if (unlinked === "1") {
    conditions.push(sql`AND s.classroom_id IS NULL`);
  } else if (classroomId && Number.isFinite(Number(classroomId))) {
    conditions.push(sql`AND s.classroom_id = ${Number(classroomId)}`);
  }
  const where = sql.join(conditions, sql` `);

  const result = await db.execute<SubjectRow>(sql`
    SELECT s.id, s.name, s.classroom_id, c.grade, c.section,
           s.items, s.total_max, s.passing_score,
           (SELECT count(*)::int FROM grades g WHERE g.subject_id = s.id) AS students_graded
    FROM subjects s
    LEFT JOIN classrooms c ON c.id = s.classroom_id
    WHERE 1 = 1 ${where}
    ORDER BY s.name
  `);

  return NextResponse.json({
    ok: true,
    subjects: (result.rows ?? []).map((row) => ({
      ...row,
      items: normalizeItems(row.items ?? []),
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      classroomId?: number | null;
      items?: ScoreItem[];
      passingScore?: number;
    };

    const name = (body.name ?? "").trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!name) {
      return NextResponse.json({ ok: false, error: "الرجاء إدخال اسم المادة" }, { status: 400 });
    }
    if (rawItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: "أضف عموداً واحداً على الأقل لتوزيع الدرجات" },
        { status: 400 },
      );
    }

    const rawClassroom: unknown = body.classroomId;
    const hasClassroom =
      rawClassroom !== null &&
      rawClassroom !== undefined &&
      rawClassroom !== "" &&
      Number.isFinite(Number(rawClassroom)) &&
      Number(rawClassroom) > 0;
    const classroomId = hasClassroom ? Number(rawClassroom) : null;

    if (hasClassroom && !(await ownsClassroom(classroomId as number, guard.session.uid))) {
      return NextResponse.json({ ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" }, { status: 403 });
    }

    const items = cleanItems(rawItems).filter((i) => i.label && i.max > 0);
    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "يجب تعبئة أسماء الأعمدة والدرجة العظمى" },
        { status: 400 },
      );
    }

    const totalMax = computeTotalMax(items);
    if (totalMax <= 0) {
      return NextResponse.json({ ok: false, error: "الدرجة العظمى يجب أن تكون أكبر من صفر" }, { status: 400 });
    }

    const passingScore = Number(body.passingScore);
    const finalPassing =
      Number.isFinite(passingScore) && passingScore > 0 ? passingScore : Math.round(totalMax / 2);

    // منع تكرار الاسم في نفس النطاق
    const dupCheck = hasClassroom
      ? sql`SELECT id FROM subjects WHERE name = ${name} AND classroom_id = ${classroomId as number} LIMIT 1`
      : sql`SELECT id FROM subjects WHERE name = ${name} AND classroom_id IS NULL AND user_id = ${guard.session.uid} LIMIT 1`;
    const dup = await db.execute<{ id: number }>(dupCheck);
    if (dup.rows?.[0]) {
      return NextResponse.json({ ok: false, error: "يوجد مادة بنفس الاسم — اختر اسماً آخر" }, { status: 409 });
    }

    const inserted = await db.execute<SubjectRow>(sql`
      INSERT INTO subjects (name, classroom_id, user_id, items, total_max, passing_score)
      VALUES (${name}, ${classroomId}, ${guard.session.uid}, ${JSON.stringify(items)}::jsonb, ${totalMax}, ${finalPassing})
      RETURNING id, name, classroom_id, items, total_max, passing_score
    `);

    return NextResponse.json(
      {
        ok: true,
        subject: inserted.rows?.[0],
        message: classroomId
          ? "تم إضافة المادة وربطها بالفصل المحدد"
          : "تم إضافة المادة (غير مرتبطة بفصل) — يمكنك ربطها لاحقاً",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إضافة المادة",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
