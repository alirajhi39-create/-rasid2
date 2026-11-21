import type { ScoreItem, ScoreItemKind, ScorePeriod, Semester } from "@/db/schema";

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

/** تحويل أي نص مخزّن إلى قيمة فصل صالحة */
export function toSemester(value: string | null | undefined): Semester {
  if (value === "second") return "second";
  return "first";
}

/** استخراج الفصل من تسمية الإعدادات */
export function semesterFromLabel(label: string | null | undefined): Semester {
  if (label && /ثان/.test(label)) return "second";
  return "first";
}

/** ============================================================
 *  فترتان لكل فصل دراسي
 * ========================================================== */
export const PERIODS: { value: ScorePeriod; label: string; hint: string; tone: string }[] = [
  {
    value: "p1",
    label: "الفترة الأولى",
    hint: "التقييم المستمر في بداية الفصل الدراسي",
    tone: "sky",
  },
  {
    value: "p2",
    label: "الفترة الثانية",
    hint: "التقييم المستمر في نهاية الفصل الدراسي",
    tone: "violet",
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

/** أنواع خانات الدرجات */
export const ITEM_KINDS: { value: ScoreItemKind; label: string; icon: string }[] = [
  { value: "performance", label: "المهام الأدائية", icon: "📝" },
  { value: "participation", label: "المشاركة والتفاعل", icon: "🙋" },
  { value: "homework", label: "الواجبات", icon: "📚" },
  { value: "quiz", label: "الاختبارات القصيرة", icon: "⚡" },
  { value: "written", label: "اختبار تحريري", icon: "🗒️" },
  { value: "practical", label: "عملي / شفهي", icon: "🔬" },
  { value: "custom", label: "خانة مخصصة", icon: "➕" },
];

export const KIND_LABEL: Record<ScoreItemKind, string> = ITEM_KINDS.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {} as Record<ScoreItemKind, string>,
);

export const GROUPS: { value: "year" | "final"; label: string; hint: string }[] = [
  {
    value: "year",
    label: "أعمال السنة",
    hint: "المهام الأدائية، المشاركة، الواجبات، الاختبارات القصيرة",
  },
  { value: "final", label: "الاختبار النهائي", hint: "تحريري وعملي / شفهي" },
];

/* ============================================================
 * قوالب توزيع الدرجات الجاهزة (لائحة تقويم الطالب)
 *  كل قالب يوزّع الخانات على فترتي الفصل الدراسي
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
  group: "year" | "final",
  kind: ScoreItemKind,
  period: ScorePeriod = "p1",
): ScoreItem {
  return { id: nextId(), label, max, group, kind, period };
}

export const TEMPLATES: DistributionTemplate[] = [
  {
    id: "lower-primary",
    title: "ابتدائي (١ – ٣) — تقويم مستمر ١٠٠",
    stage: "ابتدائي",
    description: "لا نهائي — ٤٠ درجة للفترة الأولى و٦٠ درجة للفترة الثانية",
    items: [
      makeItem("المهام الأدائية", 15, "year", "performance", "p1"),
      makeItem("المشاركة والتفاعل", 10, "year", "participation", "p1"),
      makeItem("الواجبات", 15, "year", "homework", "p1"),
      makeItem("المهام الأدائية", 15, "year", "performance", "p2"),
      makeItem("المشاركة والتفاعل", 10, "year", "participation", "p2"),
      makeItem("الاختبارات القصيرة", 35, "year", "quiz", "p2"),
    ],
  },
  {
    id: "upper-primary",
    title: "ابتدائي (٤ – ٦) / متوسط — ٦٠ + ٤٠",
    stage: "ابتدائي",
    description: "الفترة الأولى أعمال سنة ٣٠ · الفترة الثانية أعمال سنة ٣٠ + نهائي ٤٠",
    items: [
      makeItem("المهام الأدائية", 10, "year", "performance", "p1"),
      makeItem("المشاركة والتفاعل", 10, "year", "participation", "p1"),
      makeItem("الواجبات والاختبارات القصيرة", 10, "year", "homework", "p1"),
      makeItem("المهام الأدائية", 10, "year", "performance", "p2"),
      makeItem("المشاركة والواجبات", 10, "year", "participation", "p2"),
      makeItem("الاختبارات القصيرة", 10, "year", "quiz", "p2"),
      makeItem("الاختبار النهائي التحريري", 40, "final", "written", "p2"),
    ],
  },
  {
    id: "secondary",
    title: "ثانوي — ٦٠ + ٤٠ (تحريري + عملي)",
    stage: "ثانوي",
    description: "أعمال سنة موزّعة على الفترتين + نهائي تحريري ٣٠ وعملي/شفهي ١٠",
    items: [
      makeItem("المهام الأدائية", 15, "year", "performance", "p1"),
      makeItem("المشاركة والتفاعل", 8, "year", "participation", "p1"),
      makeItem("الواجبات", 7, "year", "homework", "p1"),
      makeItem("المهام الأدائية", 15, "year", "performance", "p2"),
      makeItem("المشاركة والواجبات", 15, "year", "participation", "p2"),
      makeItem("الاختبار النهائي التحريري", 30, "final", "written", "p2"),
      makeItem("الاختبار النهائي العملي / الشفهي", 10, "final", "practical", "p2"),
    ],
  },
  {
    id: "custom-50",
    title: "قالب مختصر — ٥٠ درجة",
    stage: "متوسط",
    description: "٣٠ للفترة الأولى و٢٠ للفترة الثانية — قابل للتعديل بالكامل",
    items: [
      makeItem("أعمال الفترة الأولى", 30, "year", "performance", "p1"),
      makeItem("أعمال الفترة الثانية", 15, "year", "participation", "p2"),
      makeItem("الاختبار النهائي", 5, "final", "written", "p2"),
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
