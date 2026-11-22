import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ownsClassroom, ownsSubject } from "@/lib/ownership";
import { computeTotalMax, normalizeItems } from "@/lib/grades";
import type { ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/subjects/[id]
 *  - تعديل الاسم / الأعمدة / درجة النجاح
 *  - الربط بفصل:  classroomId = <رقم>
 *  - فك الربط:    classroomId = null
 * لا يتم الربط تلقائياً بأي فصل — الربط صريح فقط.
 */
export async function PUT(request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const subjectId = Number(id);
  if (!Number.isFinite(subjectId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsSubject(subjectId, guard.session.uid)).owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    items?: ScoreItem[];
    passingScore?: number;
    classroomId?: number | null;
  };

  const current = await db.execute<{ name: string; classroom_id: number | null }>(
    sql`SELECT name, classroom_id FROM subjects WHERE id = ${subjectId} LIMIT 1`,
  );
  const currentRow = current.rows?.[0];
  if (!currentRow) {
    return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
  }

  const updates: string[] = [];
  const name = (body.name ?? "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : null;
  let linkAction: "linked" | "unlinked" | "none" = "none";

  /* ----------------------- الربط / فك الربط ----------------------- */
  if (body.classroomId !== undefined) {
    const raw: unknown = body.classroomId;
    const hasClassroom =
      raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) > 0;

    if (hasClassroom) {
      const classroomId = Number(raw);
      if (!(await ownsClassroom(classroomId, guard.session.uid))) {
        return NextResponse.json(
          { ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" },
          { status: 403 },
        );
      }
      const effectiveName = name || currentRow.name;
      const dup = await db.execute<{ id: number }>(
        sql`SELECT id FROM subjects
            WHERE name = ${effectiveName} AND classroom_id = ${classroomId} AND id <> ${subjectId} LIMIT 1`,
      );
      if (dup.rows?.[0]) {
        return NextResponse.json(
          { ok: false, error: "يوجد مادة بنفس الاسم في هذا الفصل — غيّر الاسم أو احذف الأخرى" },
          { status: 409 },
        );
      }
      updates.push(`classroom_id = ${classroomId}`);
      linkAction = "linked";
    } else {
      // فك الربط — تحقق من عدم وجود مادة غير مرتبطة بنفس الاسم لنفس المعلم
      const effectiveName = name || currentRow.name;
      const clash = await db.execute<{ id: number }>(
        sql`SELECT id FROM subjects
            WHERE name = ${effectiveName} AND classroom_id IS NULL
              AND user_id = ${guard.session.uid} AND id <> ${subjectId} LIMIT 1`,
      );
      if (clash.rows?.[0]) {
        return NextResponse.json(
          { ok: false, error: "لديك مادة غير مرتبطة بنفس الاسم — غيّر الاسم أولاً" },
          { status: 409 },
        );
      }
      updates.push(`classroom_id = NULL`);
      linkAction = "unlinked";
    }
  }

  /* ----------------------- تعديل بيانات المادة ----------------------- */
  if (name) updates.push(`name = '${name.replace(/'/g, "''")}'`);

  if (rawItems) {
    if (rawItems.length === 0) {
      return NextResponse.json({ ok: false, error: "أضف عموداً واحداً على الأقل" }, { status: 400 });
    }
    const cleaned = normalizeItems(rawItems)
      .map((item, index): ScoreItem => ({
        id: item.id || `it_${Date.now().toString(36)}_${index}`,
        label: String(item.label ?? `خانة ${index + 1}`).trim(),
        max: Math.max(0, Number(item.max) || 0),
        group: item.group,
        kind: item.kind ?? "custom",
        period: item.period,
      }))
      .filter((i) => i.label && i.max > 0);

    if (cleaned.length === 0) {
      return NextResponse.json(
        { ok: false, error: "يجب تعبئة أسماء الأعمدة والدرجة العظمى" },
        { status: 400 },
      );
    }

    const totalMax = computeTotalMax(cleaned);
    if (totalMax <= 0) {
      return NextResponse.json({ ok: false, error: "الدرجة العظمى يجب أن تكون أكبر من صفر" }, { status: 400 });
    }
    const passingScore = Number(body.passingScore);
    const finalPassing =
      Number.isFinite(passingScore) && passingScore > 0 ? passingScore : Math.round(totalMax / 2);
    updates.push(`items = '${JSON.stringify(cleaned).replace(/'/g, "''")}'::jsonb`);
    updates.push(`total_max = ${totalMax}`);
    updates.push(`passing_score = ${finalPassing}`);
  } else if (Number.isFinite(Number(body.passingScore)) && Number(body.passingScore) > 0) {
    updates.push(`passing_score = ${Number(body.passingScore)}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: false, error: "لا توجد بيانات للتحديث" }, { status: 400 });
  }

  await db.execute(
    sql.raw(`UPDATE subjects SET ${updates.join(", ")}, updated_at = now() WHERE id = ${subjectId}`),
  );

  const fresh = await db.execute<{
    id: number;
    name: string;
    classroom_id: number | null;
    items: ScoreItem[];
    total_max: string;
    passing_score: string;
  }>(
    sql`SELECT id, name, classroom_id, items, total_max, passing_score FROM subjects WHERE id = ${subjectId} LIMIT 1`,
  );

  const messages: Record<typeof linkAction, string> = {
    linked: "تم ربط المادة بالفصل بنجاح",
    unlinked: "تم فك ربط المادة — لن تُربط تلقائياً بأي فصل",
    none: "تم تحديث المادة بنجاح",
  };

  return NextResponse.json({
    ok: true,
    subject: fresh.rows?.[0],
    message: messages[linkAction],
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const subjectId = Number(id);
  if (!Number.isFinite(subjectId)) {
    return NextResponse.json({ ok: false, error: "معرّف غير صالح" }, { status: 400 });
  }
  if (!(await ownsSubject(subjectId, guard.session.uid)).owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  await db.execute(sql`DELETE FROM subjects WHERE id = ${subjectId}`);
  return NextResponse.json({ ok: true, message: "تم حذف المادة ودرجاتها" });
}
