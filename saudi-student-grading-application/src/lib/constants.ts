import type { ScoreItem, ScoreItemKind, ScorePeriod, ScoreGroup, Semester } from "@/db/schema";

export const APP_NAME = "نظام رصد درجات الطلاب";
export const APP_SHORT = "رصد";

/** المراحل الدراسية */
export const STAGES = ["ابتدائي", "متوسط", "ثانوي"] as const;
export type Stage = (typeof STAGES)[number];

/** الصفوف الدراسية حسب المرحلة */
export const GRADES_BY_STAGE: Record<Stage, string[]> = {
  ابتدائي: ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"],
  متوسط: ["الأول", "الثاني", "الثالث"],
  ثانوي: ["الأول", "الثاني", "الثالث"],
};

export const SECTIONS = ["أ", "ب", "ج", "د", "هـ", "و"];

/** ============================================================
 *  الفصلان الدراسيان الرأسيان فقط (لا يوجد فصل ثالث)
 * ========================================================== */
export const SEMESTERS: { value: Semester; label: string; short: string }[] = [
  { value: "first", label: "الفصل الدراسي الأول", short: "الفصل الأول" },
  { value: "second", label: "الفصل الدراسي الثاني", short: "الفصل الثاني" },
];

export const SEMESTER_LABEL: Record<Semester, string> = {
  first: "الفصل الدراسي الأول",
  second: "الفصل الدراسي الثاني",
};

export const SEMESTER_SHORT: Record<Semester, string> = {
  first: "الفصل الأول",
  second: "الفصل الثاني",
};

export function toSemester(value: string | null | undefined): Semester {
  if (value === "second") return "second";
  return "first";
}

export function semesterFromLabel(label: string | null | undefined): Semester {
  if (label && /ثان/.test(label)) return "second";
  return "first";
}

/** ============================================================
 *  فترتان لكل فصل دراسي
 * ========================================================== */
export const PERIODS: {
  value: ScorePeriod;
  label: string;
  short: string;
  hint: string;
  tone: string;
}[] = [
  {
    value: "p1",
    label: "الفترة الأولى",
    short: "ف١",
    hint: "التقييم المستمر في بداية الفصل الدراسي",
    tone: "sky",
  },
  {
    value: "p2",
    label: "الفترة الثانية",
    short: "ف٢",
    hint: "التقييم المستمر في نهاية الفصل الدراسي",
    tone: "amber",
  },
];

export const PERIOD_LABEL: Record<ScorePeriod, string> = {
  p1: "الفترة الأولى",
  p2: "الفترة الثانية",
};

export const PERIOD_SHORT: Record<ScorePeriod, string> = {
  p1: "ف١",
  p2: "ف٢",
};

export function toPeriod(value: string | null | undefined): ScorePeriod {
  return value === "p2" ? "p2" : "p1";
}

export const GRADE_LABEL_PREFIX = "الصف";

/** ============================================================
 *  أنواع خانات الدرجات
 * ========================================================== */
export const ITEM_KINDS: { value: ScoreItemKind; label: string; icon: string; group: ScoreGroup }[] = [
  { value: "performance", label: "مهمة أدائية", icon: "📝", group: "performance" },
  { value: "participation", label: "المشاركة والتفاعل", icon: "🙋", group: "performance" },
  { value: "homework", label: "الواجبات", icon: "📚", group: "performance" },
  { value: "practical", label: "عملي / شفهي", icon: "🔬", group: "performance" },
  { value: "quiz", label: "اختبار قصير", icon: "⚡", group: "performance" },
  { value: "custom", label: "خانة مخصصة", icon: "➕", group: "performance" },
  { value: "written", label: "تقويم تحريري", icon: "🗒️", group: "written" },
];

export const KIND_LABEL: Record<ScoreItemKind, string> = ITEM_KINDS.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {} as Record<ScoreItemKind, string>,
);

/** ============================================================
 *  مجموعات التقييم — المهام الأدائية ٤٠ + التقويمات التحريرية ٦٠
 *  يمكن إضافة عدد غير محدود من الأعمدة تحت كل مجموعة
 * ========================================================== */
export const GROUPS: {
  value: ScoreGroup;
  label: string;
  targetMax: number;
  hint: string;
  tone: string;
  ring: string;
  bg: string;
  text: string;
}[] = [
  {
    value: "performance",
    label: "المهام الأدائية",
    targetMax: 40,
    hint: "مهام أدائية، مشاركة، واجبات، اختبارات قصيرة، عملي/شفهي",
    tone: "sky",
    ring: "ring-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
  },
  {
    value: "written",
    label: "التقويمات التحريرية",
    targetMax: 60,
    hint: "التقويمات التحريرية المتعددة خلال الفصل الدراسي",
    tone: "violet",
    ring: "ring-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
  },
];

export const GROUP_LABEL: Record<ScoreGroup, string> = {
  performance: "المهام الأدائية",
  written: "التقويمات التحريرية",
};

export const GROUP_TARGET: Record<ScoreGroup, number> = {
  performance: 40,
  written: 60,
};

/** تحويل آمن لقيمة المجموعة (بيانات قديمة year/final) */
export function toGroup(value: string | null | undefined): ScoreGroup {
  if (value === "written" || value === "final") return "written";
  return "performance";
}

/* ============================================================
 * قوالب توزيع الدرجات الجاهزة — كلها ٤٠ مهام أدائية + ٦٠ تحريري
 * ========================================================== */

export type DistributionTemplate = {
  id: string;
  title: string;
  stage: string;
  description: string;
  items: ScoreItem[];
};

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function makeItem(
  label: string,
  max: number,
  group: ScoreGroup,
  kind: ScoreItemKind,
  period: ScorePeriod = "p1",
): ScoreItem {
  return { id: nextId(), label, max, group, kind, period };
}

export const TEMPLATES: DistributionTemplate[] = [
  {
    id: "standard-40-60",
    title: "التوزيع المعتمد — مهام ٤٠ (٤ أعمدة) + تحريري ٦٠ (٤ أعمدة)",
    stage: "عام",
    description: "٨ أعمدة موزّعة على فترتي الفصل الدراسي — ٥٠ درجة لكل فترة",
    items: [
      makeItem("مهمة أدائية (١)", 10, "performance", "performance", "p1"),
      makeItem("مهمة أدائية (٢)", 10, "performance", "performance", "p1"),
      makeItem("تقويم تحريري (١)", 15, "written", "written", "p1"),
      makeItem("تقويم تحريري (٢)", 15, "written", "written", "p1"),
      makeItem("مهمة أدائية (٣)", 10, "performance", "performance", "p2"),
      makeItem("مهمة أدائية (٤)", 10, "performance", "performance", "p2"),
      makeItem("تقويم تحريري (٣)", 15, "written", "written", "p2"),
      makeItem("تقويم تحريري (٤)", 15, "written", "written", "p2"),
    ],
  },
  {
    id: "compact-40-60",
    title: "مختصر — مهام ٤٠ (٢ عمود) + تحريري ٦٠ (٢ عمود)",
    stage: "عام",
    description: "٤ أعمدة فقط — ٢٠ مهام أدائية و٣٠ تحريري في كل فترة",
    items: [
      makeItem("المهام الأدائية — الفترة الأولى", 20, "performance", "performance", "p1"),
      makeItem("التقويم التحريري — الفترة الأولى", 30, "written", "written", "p1"),
      makeItem("المهام الأدائية — الفترة الثانية", 20, "performance", "performance", "p2"),
      makeItem("التقويم التحريري — الفترة الثانية", 30, "written", "written", "p2"),
    ],
  },
  {
    id: "detailed-40-60",
    title: "مفصّل — مهام ٤٠ (٨ أعمدة) + تحريري ٦٠ (٣ أعمدة)",
    stage: "عام",
    description: "تقويم مستمر بأعمدة كثيرة + ٣ تقويمات تحريرية",
    items: [
      makeItem("مهمة أدائية (١)", 5, "performance", "performance", "p1"),
      makeItem("المشاركة والتفاعل (١)", 5, "performance", "participation", "p1"),
      makeItem("الواجبات (١)", 5, "performance", "homework", "p1"),
      makeItem("اختبار قصير (١)", 5, "performance", "quiz", "p1"),
      makeItem("مهمة أدائية (٢)", 5, "performance", "performance", "p2"),
      makeItem("المشاركة والتفاعل (٢)", 5, "performance", "participation", "p2"),
      makeItem("الواجبات (٢)", 5, "performance", "homework", "p2"),
      makeItem("اختبار قصير (٢)", 5, "performance", "quiz", "p2"),
      makeItem("التقويم التحريري (١)", 20, "written", "written", "p1"),
      makeItem("التقويم التحريري (٢)", 20, "written", "written", "p2"),
      makeItem("التقويم التحريري (٣)", 20, "written", "written", "p2"),
    ],
  },
  {
    id: "no-periods-40-60",
    title: "بدون فترات — مهام ٤٠ (٢) + تحريري ٦٠ (٢)",
    stage: "عام",
    description: "كل الأعمدة في الفترة الثانية — مناسب للتقويم المُجمَّع",
    items: [
      makeItem("المهام الأدائية (١)", 20, "performance", "performance", "p2"),
      makeItem("المهام الأدائية (٢)", 20, "performance", "performance", "p2"),
      makeItem("التقويم التحريري (١)", 30, "written", "written", "p2"),
      makeItem("التقويم التحريري (٢)", 30, "written", "written", "p2"),
    ],
  },
  {
    id: "blank-40-60",
    title: "قالب للتعديل — أضف أعمدتك بنفسك",
    stage: "عام",
    description: "نقطة بداية بسيطة — استخدم زر «إضافة عمود» تحت كل مجموعة",
    items: [
      makeItem("مهمة أدائية", 10, "performance", "performance", "p1"),
      makeItem("تقويم تحريري", 15, "written", "written", "p1"),
    ],
  },
];

/** التقديرات وفق لائحة تقويم الطالب */
export const RATINGS = [
  { key: "excellent", label: "ممتاز", min: 90, color: "emerald" },
  { key: "vgood", label: "جيد جداً", min: 80, color: "sky" },
  { key: "good", label: "جيد", min: 65, color: "amber" },
  { key: "pass", label: "مقبول", min: 50, color: "orange" },
  { key: "weak", label: "ضعيف", min: 0, color: "rose" },
] as const;

export const SUBJECT_SUGGESTIONS = [
  "القرآن الكريم",
  "الدراسات الإسلامية",
  "اللغة العربية",
  "الرياضيات",
  "العلوم",
  "اللغة الإنجليزية",
  "الاجتماعيات",
  "المهارات الرقمية",
  "التربية الفنية",
  "التربية البدنية",
  "المهارات الحياتية والأسرية",
  "التفكير الناقد",
];
