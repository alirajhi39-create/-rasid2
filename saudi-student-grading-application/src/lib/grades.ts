import { GROUP_LABEL, GROUP_TARGET, PERIOD_LABEL, RATINGS } from "./constants";
import { toGroup } from "./constants";
import type { GradeValues, ScoreItem, ScorePeriod, ScoreGroup, Semester } from "@/db/schema";

export type RatingKey = (typeof RATINGS)[number]["key"];

export type RatingInfo = {
  key: RatingKey;
  label: string;
  color: string;
  passed: boolean;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** حساب المجموع من قيم الخانات */
export function computeTotal(items: ScoreItem[], values: GradeValues): number {
  let total = 0;
  for (const item of items) {
    const raw = values?.[item.id];
    const num = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    total += Math.max(0, Math.min(num, item.max));
  }
  return round2(total);
}

/** احتساب مجموع الدرجة العظمى */
export function computeTotalMax(items: ScoreItem[]): number {
  return round2(items.reduce((sum, item) => sum + (Number(item.max) || 0), 0));
}

/** مجموع مجموعة التقييم (المهام الأدائية / التقويمات التحريرية) */
export function computeGroupTotal(items: ScoreItem[], values: GradeValues, group: ScoreGroup) {
  let got = 0;
  let max = 0;
  for (const item of items) {
    if (toGroup(item.group) !== group) continue;
    max += Number(item.max) || 0;
    const raw = values?.[item.id];
    got += typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  }
  return { got: round2(got), max: round2(max) };
}

/** مجموع فترة (الفترة الأولى / الثانية) */
export function computePeriodTotal(items: ScoreItem[], values: GradeValues, period: ScorePeriod) {
  let got = 0;
  let max = 0;
  for (const item of items) {
    if (toPeriod(item.period) !== period) continue;
    max += Number(item.max) || 0;
    const raw = values?.[item.id];
    got += typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  }
  return { got: round2(got), max: round2(max) };
}

/** تحويل آمن لقيمة الفترة */
export function toPeriod(value: string | null | undefined): ScorePeriod {
  return value === "p2" ? "p2" : "p1";
}

/** إرجاع الخانات مُرتَّبة حسب المجموعة (المهام الأدائية ثم التقويمات التحريرية) */
export function itemsByGroup(items: ScoreItem[]): { group: ScoreGroup; items: ScoreItem[] }[] {
  const groups: ScoreGroup[] = ["performance", "written", "oral"];
  return groups
    .map((group) => ({ group, items: items.filter((i) => toGroup(i.group) === group) }))
    .filter((g) => g.items.length > 0);
}

/** إرجاع الخانات مُرتَّبة حسب الفترة */
export function itemsByPeriod(items: ScoreItem[]): { period: ScorePeriod; items: ScoreItem[] }[] {
  const periods: ScorePeriod[] = ["p1", "p2"];
  return periods
    .map((period) => ({ period, items: items.filter((i) => toPeriod(i.period) === period) }))
    .filter((g) => g.items.length > 0);
}

/** حدود النِّسب المئوية للتقديرات — تُضبط من الإعدادات */
export type RatingThresholds = {
  excellent: number;
  vgood: number;
  good: number;
  pass: number;
};

/** القيم الافتراضية (لائحة تقويم الطالب) */
export const DEFAULT_THRESHOLDS: RatingThresholds = {
  excellent: 90,
  vgood: 80,
  good: 65,
  pass: 50,
};

/** تحويل إعدادات المخزن إلى حدود */
export function thresholdsFrom(
  source:
    | {
        pctExcellent?: number | null;
        pctVgood?: number | null;
        pctGood?: number | null;
        pctPass?: number | null;
      }
    | null
    | undefined,
): RatingThresholds {
  if (!source) return DEFAULT_THRESHOLDS;
  const num = (v: number | null | undefined, fallback: number) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback;
  return {
    excellent: num(source.pctExcellent, DEFAULT_THRESHOLDS.excellent),
    vgood: num(source.pctVgood, DEFAULT_THRESHOLDS.vgood),
    good: num(source.pctGood, DEFAULT_THRESHOLDS.good),
    pass: num(source.pctPass, DEFAULT_THRESHOLDS.pass),
  };
}

/** بناء قائمة التقديرات مرتّبة تنازلياً حسب الحدود */
export function ratingScale(t: RatingThresholds = DEFAULT_THRESHOLDS) {
  const ex = Math.max(t.excellent, t.vgood, t.good, t.pass);
  const vg = Math.max(t.vgood, t.good, t.pass);
  const gd = Math.max(t.good, t.pass);
  const ps = Math.max(t.pass, 1);
  return [
    { ...RATINGS[0], min: ex },
    { ...RATINGS[1], min: vg },
    { ...RATINGS[2], min: gd },
    { ...RATINGS[3], min: ps },
    { ...RATINGS[4], min: 0 },
  ];
}

export function getRating(
  total: number,
  totalMax: number,
  passingScore: number,
  thresholds: RatingThresholds = DEFAULT_THRESHOLDS,
): RatingInfo {
  const pct = totalMax > 0 ? (total / totalMax) * 100 : 0;
  const found = ratingScale(thresholds).find((r) => pct >= r.min) ?? RATINGS[RATINGS.length - 1];
  return {
    key: found.key as RatingKey,
    label: found.label,
    color: found.color,
    passed: total >= passingScore,
  };
}

export function gradeColorClasses(color: string) {
  switch (color) {
    case "emerald":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "sky":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "amber":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "orange":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    default:
      return "bg-rose-50 text-rose-700 ring-rose-200";
  }
}

/** تحويل رقم إلى أرقام هندية (٠١٢٣...) */
export function toArabicDigits(value: number | string): string {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(value).replace(/[0-9]/g, (d) => map[Number(d)]);
}

/** هل الدرجة مُدخلة؟ */
export function hasAnyValue(values: GradeValues): boolean {
  return Object.values(values ?? {}).some((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
}

/** إحصاءات مجموعة من الدرجات */
export function statsFor(rows: { total: number }[], totalMax: number, passingScore: number) {
  const count = rows.length;
  const passed = rows.filter((r) => r.total >= passingScore).length;
  const failed = count - passed;
  const avg = count ? round2(rows.reduce((s, r) => s + r.total, 0) / count) : 0;
  const highest = count ? round2(Math.max(...rows.map((r) => r.total))) : 0;
  const lowest = count ? round2(Math.min(...rows.map((r) => r.total))) : 0;
  const pct = totalMax > 0 ? round2((avg / totalMax) * 100) : 0;
  return { count, passed, failed, avg, highest, lowest, pct };
}

/* ============================================================
 *  متوسط الفترتين ومتوسط الفصلين
 * ========================================================== */

export type SemesterScores = { first: number; second: number };

/** مجموع الفصلين = الفصل الأول + الفصل الثاني */
export function yearTotal(scores: SemesterScores): number {
  return round2((scores.first ?? 0) + (scores.second ?? 0));
}

/**
 * متوسط مجموع الفترتين داخل فصل دراسي واحد:
 * (مجموع الفترة الأولى + مجموع الفترة الثانية) ÷ عدد الفترات المرصدة
 * الفترات غير المرصدة لا تُحتسب حتى لا ينخفض المتوسط ظلماً.
 */
export function periodAverage(items: ScoreItem[], values: GradeValues): number {
  const p1 = computePeriodTotal(items, values, "p1").got;
  const p2 = computePeriodTotal(items, values, "p2").got;
  const parts = [p1, p2].filter((v) => v > 0);
  if (parts.length === 0) return 0;
  return round2(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** الدرجة العظمى لمتوسط الفترتين */
export function periodAverageMax(items: ScoreItem[]): number {
  const p1 = items.filter((i) => toPeriod(i.period) === "p1").reduce((s, i) => s + (i.max || 0), 0);
  const p2 = items.filter((i) => toPeriod(i.period) === "p2").reduce((s, i) => s + (i.max || 0), 0);
  const parts = [p1, p2].filter((v) => v > 0);
  if (parts.length === 0) return 0;
  return round2(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** متوسط الفصلين الدراسيين */
export function yearAverage(scores: SemesterScores): number {
  const parts = [scores.first, scores.second].filter((v) => typeof v === "number" && v > 0);
  if (parts.length === 0) return 0;
  return round2(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** الدرجة العظمى السنوية */
export function yearMax(totalMax: number, semestersCount: number): number {
  return round2(totalMax * Math.max(1, Math.min(2, semestersCount)));
}

/** نص الفصل الدراسي */
export function semesterText(semester: Semester): string {
  return SEMESTER_LABEL_SAFE[semester] ?? "الفصل الدراسي الأول";
}

const SEMESTER_LABEL_SAFE: Record<string, string> = {
  first: "الفصل الدراسي الأول",
  second: "الفصل الدراسي الثاني",
};

/** نص الفترة */
export function periodText(period: ScorePeriod): string {
  return PERIOD_LABEL[period] ?? "الفترة الأولى";
}

/** نص المجموعة */
export function groupText(group: ScoreGroup): string {
  return GROUP_LABEL[group] ?? "المهام الأدائية";
}

/** الهدف المعتمد للمجموعة */
export function groupTarget(group: ScoreGroup): number {
  return GROUP_TARGET[group] ?? 0;
}

/** تنسيق الخانات المخزّنة (تحويل القيم القديمة) */
export function normalizeItems(items: ScoreItem[]): ScoreItem[] {
  return items.map((item) => ({
    ...item,
    group: toGroup(item.group),
    period: toPeriod(item.period),
  }));
}
