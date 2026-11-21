import { PERIOD_LABEL, RATINGS, SEMESTER_LABEL } from "./constants";
import type { GradeValues, ScoreItem, ScorePeriod, Semester } from "@/db/schema";

export type RatingKey = (typeof RATINGS)[number]["key"];

export type RatingInfo = {
  key: RatingKey;
  label: string;
  color: string;
  passed: boolean;
};

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

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** احتساب مجموع الدرجة العظمى */
export function computeTotalMax(items: ScoreItem[]): number {
  return round2(items.reduce((sum, item) => sum + (Number(item.max) || 0), 0));
}

/** احتساب مجموع مجموعة (أعمال السنة / الاختبار النهائي) */
export function computeGroupTotal(items: ScoreItem[], values: GradeValues, group: "year" | "final") {
  let got = 0;
  let max = 0;
  for (const item of items) {
    if (item.group !== group) continue;
    max += Number(item.max) || 0;
    const raw = values?.[item.id];
    got += typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  }
  return { got: round2(got), max: round2(max) };
}

/** احتساب مجموع فترة (الفترة الأولى / الفترة الثانية) داخل الفصل الدراسي */
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

/** تحويل آمن لقيمة الفترة (بيانات قديمة قد لا تحتوي الحقل) */
export function toPeriod(value: string | null | undefined): ScorePeriod {
  return value === "p2" ? "p2" : "p1";
}

/** إرجاع الخانات مُرتَّبة حسب الفترة */
export function itemsByPeriod(items: ScoreItem[]): { period: ScorePeriod; items: ScoreItem[] }[] {
  const periods: ScorePeriod[] = ["p1", "p2"];
  return periods
    .map((period) => ({ period, items: items.filter((i) => toPeriod(i.period) === period) }))
    .filter((group) => group.items.length > 0);
}

export function getRating(total: number, totalMax: number, passingScore: number): RatingInfo {
  const pct = totalMax > 0 ? (total / totalMax) * 100 : 0;
  const found = RATINGS.find((r) => pct >= r.min) ?? RATINGS[RATINGS.length - 1];
  return {
    key: found.key,
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

/** تحويل رقم إلى أحرف عربية (للتقارير) */
export function numberToArabicWords(n: number): string {
  const ones = [
    "صفر",
    "واحد",
    "اثنان",
    "ثلاثة",
    "أربعة",
    "خمسة",
    "ستة",
    "سبعة",
    "ثمانية",
    "تسعة",
    "عشرة",
  ];
  const r = round2(n);
  if (Number.isInteger(r) && r >= 0 && r <= 10) return ones[r];
  return r.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
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
  const graded = rows.filter((r) => r.total > 0);
  const passed = rows.filter((r) => r.total >= passingScore).length;
  const failed = count - passed;
  const avg = count ? round2(rows.reduce((s, r) => s + r.total, 0) / count) : 0;
  const highest = count ? round2(Math.max(...rows.map((r) => r.total))) : 0;
  const lowest = count ? round2(Math.min(...rows.map((r) => r.total))) : 0;
  const pct = totalMax > 0 ? round2((avg / totalMax) * 100) : 0;
  return { count, graded: graded.length, passed, failed, avg, highest, lowest, pct };
}

/* ============================================================
 *  حسابات الفصلين الدراسيين (مجموع الفصلين والمتوسط)
 * ========================================================== */

export type SemesterScores = { first: number; second: number };

/** مجموع الفصلين = مجموع الفصل الأول + مجموع الفصل الثاني */
export function yearTotal(scores: SemesterScores): number {
  return round2((scores.first ?? 0) + (scores.second ?? 0));
}

/** متوسط الفصلين */
export function yearAverage(scores: SemesterScores): number {
  const parts = [scores.first, scores.second].filter((v) => typeof v === "number" && v > 0);
  if (parts.length === 0) return 0;
  return round2(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** الدرجة العظمى السنوية = عظمى الفصل × عدد الفصول المرصدة */
export function yearMax(totalMax: number, semestersCount: number): number {
  return round2(totalMax * Math.max(1, Math.min(2, semestersCount)));
}

/** نص الفصل الدراسي */
export function semesterText(semester: Semester): string {
  return SEMESTER_LABEL[semester] ?? "الفصل الدراسي الأول";
}

/** نص الفترة */
export function periodText(period: ScorePeriod): string {
  return PERIOD_LABEL[period] ?? "الفترة الأولى";
}
