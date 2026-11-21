import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ownsSubject } from "@/lib/ownership";
import { computeTotalMax } from "@/lib/grades";
import type { ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

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
  };

  const name = (body.name ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!name || items.length === 0) {
    return NextResponse.json({ ok: false, error: "بيانات غير مكتملة" }, { status: 400 });
  }

  const cleaned: ScoreItem[] = items.map((item, index): ScoreItem => ({
    id: item.id || `it_${Date.now().toString(36)}_${index}`,
    label: String(item.label ?? `خانة ${index + 1}`).trim(),
    max: Math.max(0, Number(item.max) || 0),
    group: item.group === "final" ? "final" : "year",
    kind: item.kind ?? "custom",
    period: item.period === "p2" ? "p2" : "p1",
  }));

  const totalMax = computeTotalMax(cleaned);
  const passingScore = Number(body.passingScore);
  const finalPassing =
    Number.isFinite(passingScore) && passingScore > 0 ? passingScore : Math.round(totalMax / 2);

  await db.execute(
    sql`UPDATE subjects SET name = ${name}, items = ${JSON.stringify(cleaned)}::jsonb,
        total_max = ${totalMax}, passing_score = ${finalPassing}, updated_at = now()
        WHERE id = ${subjectId}`,
  );

  return NextResponse.json({ ok: true, message: "تم تحديث المادة وتوزيع الدرجات" });
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
