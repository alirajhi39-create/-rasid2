"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  Spinner,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import { GRADE_LABEL_PREFIX, SEMESTERS } from "@/lib/constants";
import type { Semester } from "@/db/schema";

type Classroom = { id: number; grade: string; section: string; stage: string };

type Level = { key: string; label: string; color: string; count: number; pct: number };
type Skill = {
  subject: string;
  label: string;
  group: string;
  max: number;
  avgPct: number;
  masteryRate: number;
  struggleCount: number;
  gradedCount: number;
  period: string;
};
type SubjectStat = {
  id: number;
  name: string;
  totalMax: number;
  gradedCount: number;
  avg: number;
  pct: number;
  masteryRate: number;
  passed: number;
  failed: number;
  passRate: number;
  highest: number;
  lowest: number;
};
type ClassStat = {
  id: number;
  grade: string;
  section: string;
  stage: string;
  studentsCount: number;
  avg: number;
  pct: number;
  current: boolean;
};
type StudentRow = {
  id: number;
  name: string;
  classNumber: number | null;
  gradedCount: number;
  total: number;
  avg: number;
  pct: number;
  passedCount: number;
  failedCount: number;
};
type Trend = {
  comparedCount: number;
  improved: number;
  declined: number;
  stable: number;
  previousSemester: string;
  students: {
    id: number;
    name: string;
    current: number;
    previous: number;
    delta: number;
    direction: string;
  }[];
};

type Analytics = {
  mode: "semester" | "year";
  semester: Semester;
  semesterLabel: string;
  classroom: { id: number; grade: string; section: string; stage: string };
  mastery: {
    masteryPct: number;
    passPct: number;
    masteryRate: number;
    passRate: number;
    masteredCount: number;
    achievedCount: number;
    gradedCount: number;
  };
  levels: Level[];
  skills: Skill[];
  criticalSkills: Skill[];
  strongSkills: Skill[];
  subjects: SubjectStat[];
  classes: ClassStat[];
  trend: Trend;
  actions: {
    remedial: { id: number; name: string; pct: number; weakest: string[]; action: string }[];
    enrichment: { id: number; name: string; pct: number; action: string }[];
    familyFeedback: { id: number; name: string; pct: number; message: string }[];
    teachingAdjustments: {
      skill: string;
      subject: string;
      struggleCount: number;
      gradedCount: number;
      struggleRate: number;
      recommendation: string;
    }[];
  };
  students: StudentRow[];
  summary: {
    studentsCount: number;
    subjectsCount: number;
    gradedStudents: number;
    classAvg: number;
    classPct: number;
    totalAchieved: number;
    totalPossible: number;
    completionRate: number;
  };
};

const LEVEL_TONE: Record<string, string> = {
  exceptional: "bg-emerald-500",
  mastery: "bg-sky-500",
  followup: "bg-amber-500",
  support: "bg-rose-500",
};

type Tab = "overview" | "skills" | "compare" | "actions" | "students";

export default function AnalyticsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester>("first");
  const [mode, setMode] = useState<"semester" | "year">("semester");
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ classrooms: Classroom[] }>("/api/classrooms");
      if (res.ok && res.data) {
        const list = res.data.classrooms ?? [];
        setClassrooms(list);
        setClassroomId((prev) => prev ?? list[0]?.id ?? null);
      } else if (res.error) pushToast("error", res.error);
    })();
  }, [pushToast]);

  const load = useCallback(async () => {
    if (!classroomId) {
      setData(null);
      return;
    }
    setLoading(true);
    const res = await apiFetch<Analytics>(
      `/api/analytics?classroomId=${classroomId}&semester=${semester}&mode=${mode}`,
    );
    if (res.ok && res.data) setData(res.data);
    else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [classroomId, semester, mode, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const maxLevel = data ? Math.max(1, ...data.levels.map((l) => l.count)) : 1;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "نظرة عامة", icon: "🎯" },
    { id: "skills", label: "المهارات والفاقد", icon: "🧩" },
    { id: "compare", label: "المقارنات", icon: "⚖️" },
    { id: "actions", label: "المخرجات العملية", icon: "🧭" },
    { id: "students", label: "تحليل الطلاب", icon: "👨‍🎓" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* الترويسة */}
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">
            تحليل نتائج المرحلة الابتدائية
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            تشخيص مستوى إتقان المهارات الأساسية وبناء إجراءات تربوية — لا يقتصر على رصد الدرجات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(classroomId ?? "")}
            onChange={(e) => setClassroomId(e.target.value ? Number(e.target.value) : null)}
            className="w-52"
          >
            <option value="">— اختر الفصل —</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
              </option>
            ))}
          </Select>
          <Select
            value={semester}
            onChange={(e) => setSemester(e.target.value as Semester)}
            className="w-44"
            disabled={mode === "year"}
          >
            {SEMESTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: "semester" as const, label: "📅 الفصل الدراسي" },
              { id: "year" as const, label: "🗓 العام" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  mode === opt.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            🔄
          </Button>
        </div>
      </div>

      {!classroomId ? (
        <Card>
          <EmptyState icon="📊" title="اختر فصلاً لعرض التحليل التربوي" />
        </Card>
      ) : loading && !data ? (
        <Card>
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner className="text-brand-600" /> جارٍ تحليل النتائج...
          </div>
        </Card>
      ) : !data || data.summary.gradedStudents === 0 ? (
        <Card>
          <EmptyState
            icon="📈"
            title="لا توجد درجات مرصودة للتحليل"
            description="ابدأ رصد الدرجات أولاً ليظهر تشخيص المهارات والخطط التربوية."
          />
        </Card>
      ) : (
        <>
          {/* شريط الفصل */}
          <div className="animate-fade-up flex flex-wrap items-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-700 to-teal-600 px-5 py-3 text-white">
            <span className="text-sm font-extrabold">
              {GRADE_LABEL_PREFIX} {data.classroom.grade} — {data.classroom.section}
            </span>
            <Badge tone="amber">{data.semesterLabel}</Badge>
            <Badge tone="sky">{data.classroom.stage}</Badge>
            <span className="ms-auto text-[11px] text-emerald-50">
              {summary?.gradedStudents ?? 0} طالباً مُرصوداً · {summary?.subjectsCount ?? 0} مادة ·
              اكتمال {summary?.completionRate ?? 0}٪
            </span>
          </div>

          {/* تبويبات */}
          <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100 p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${
                  tab === t.id
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ============ نظرة عامة ============ */}
          {tab === "overview" && (
            <div className="space-y-4">
              {/* نسبة الإتقان ونسبة الاجتياز */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-emerald-700">
                    نسبة الإتقان (≥ {data.mastery.masteryPct}٪)
                  </p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-700">
                    {data.mastery.masteryRate}٪
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-600">
                    {data.mastery.masteredCount} من {data.mastery.gradedCount} طالباً
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-sky-700">
                    نسبة الاجتياز (≥ {data.mastery.passPct}٪)
                  </p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-sky-700">
                    {data.mastery.passRate}٪
                  </p>
                  <p className="mt-1 text-[11px] text-sky-600">
                    {data.mastery.achievedCount} من {data.mastery.gradedCount} طالباً
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-slate-500">متوسط الصف</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-brand-700">
                    {summary?.classAvg ?? 0}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {summary?.classPct ?? 0}٪ من {summary?.totalPossible ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                  <p className="text-[11px] font-bold text-slate-500">المحصل / الممكن</p>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">
                    {summary?.totalAchieved ?? 0}
                    <span className="text-base text-slate-400"> / {summary?.totalPossible ?? 0}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    اكتمال الرصد {summary?.completionRate ?? 0}٪
                  </p>
                </div>
              </div>

              {/* توزيع مستويات الأداء */}
              <Card
                title="توزيع مستويات الأداء"
                subtitle={`تصنيف ${data.summary.gradedStudents} طالباً إلى فئات واضحة بأعدادهم ونسبهم`}
              >
                <div className="space-y-3">
                  {data.levels.map((level) => (
                    <div key={level.key} className="flex items-center gap-3">
                      <span className="w-48 shrink-0 text-xs font-bold text-slate-700">
                        {level.label}
                      </span>
                      <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                        <div
                          className={`flex h-full items-center justify-start rounded-lg px-2 text-[11px] font-bold text-white transition-all ${LEVEL_TONE[level.key]}`}
                          style={{ width: `${(level.count / maxLevel) * 100}%` }}
                        >
                          {level.count > 0 ? `${level.count} طالب` : ""}
                        </div>
                      </div>
                      <span className="w-20 shrink-0 text-left text-xs font-extrabold tabular-nums text-slate-600">
                        {level.pct}٪
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-xs font-extrabold text-rose-800">
                      🔴 بحاجة إلى دعم ({data.actions.remedial.length} طالب)
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-rose-700">
                      أقل من {data.mastery.passPct}٪ — يستدعي خطة علاجية فورية.
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-extrabold text-emerald-800">
                      🟢 متقنون جداً ({data.actions.enrichment.length} طالب)
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-emerald-700">
                      ٩٠٪ فأعلى — يحتاجون خطط إثرائية تحافظ على الدافعية.
                    </p>
                  </div>
                </div>
              </Card>

              {/* ملخص التحليل */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "مواد مرصودة", value: data.subjects.length, icon: "📚" },
                  {
                    label: "مهارات مُحلَّلة",
                    value: data.skills.length,
                    icon: "🧩",
                  },
                  {
                    label: "مهارات حرجة (تعثر جماعي)",
                    value: data.criticalSkills.length,
                    icon: "⚠️",
                    warn: true,
                  },
                  {
                    label: "مهارات مُتقنة (≥٨٠٪)",
                    value: data.strongSkills.length,
                    icon: "✅",
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"
                  >
                    <p className="text-xl">{c.icon}</p>
                    <p
                      className={`mt-1 text-2xl font-extrabold tabular-nums ${
                        c.warn ? "text-rose-600" : "text-slate-800"
                      }`}
                    >
                      {c.value}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============ المهارات والفاقد ============ */}
          {tab === "skills" && (
            <div className="space-y-4">
              <Card
                title="تحليل المهارات والفاقد التعليمي"
                subtitle="مرتبة تنازلياً حسب عدد الطلاب المتعثرين — ابدأ بالمهارات الحرجة أولاً"
                action={<Badge tone="rose">{data.criticalSkills.length} مهارة حرجة</Badge>}
              >
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[680px] text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">المهارة / البند</th>
                        <th className="px-3 py-2 font-bold">المادة</th>
                        <th className="px-3 py-2 font-bold">المتوسط</th>
                        <th className="px-3 py-2 font-bold">نسبة الإتقان</th>
                        <th className="px-3 py-2 font-bold">متعثرون</th>
                        <th className="px-3 py-2 font-bold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.skills.slice(0, 25).map((skill, i) => (
                        <tr key={`${skill.subject}-${skill.label}-${i}`} className="hover:bg-brand-50/40">
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{skill.label}</td>
                          <td className="px-3 py-2.5 text-slate-500">{skill.subject}</td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-brand-700">
                            {skill.avgPct}٪
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    skill.masteryRate >= 75
                                      ? "bg-emerald-500"
                                      : skill.masteryRate >= 50
                                        ? "bg-amber-500"
                                        : "bg-rose-500"
                                  }`}
                                  style={{ width: `${skill.masteryRate}%` }}
                                />
                              </div>
                              <span className="tabular-nums font-bold text-slate-600">
                                {skill.masteryRate}٪
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-rose-600">
                            {skill.struggleCount}
                          </td>
                          <td className="px-3 py-2.5">
                            {skill.struggleCount >= Math.ceil(skill.gradedCount * 0.5) ? (
                              <Badge tone="rose">حرجة</Badge>
                            ) : skill.masteryRate >= 80 ? (
                              <Badge tone="emerald">مُتقنة</Badge>
                            ) : (
                              <Badge tone="amber">متابعة</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {data.criticalSkills.length > 0 && (
                <Card
                  title="المهارات الحرجة — تعثر جماعي"
                  subtitle="مهارات تكرر فيها التعثر لدى نصف الطلاب فأكثر — الأولوية للتدخل"
                >
                  <div className="space-y-2">
                    {data.criticalSkills.map((k, i) => (
                      <div
                        key={`${k.subject}-${k.label}-${i}`}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-rose-900">{k.label}</p>
                          <p className="text-[11px] text-rose-700">
                            {k.subject} · {k.struggleCount} من {k.gradedCount} متعثرون (
                            {k.gradedCount ? Math.round((k.struggleCount / k.gradedCount) * 100) : 0}٪)
                          </p>
                        </div>
                        <Badge tone="rose">تدخّل فوري</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ============ المقارنات ============ */}
          {tab === "compare" && (
            <div className="space-y-4">
              {/* مقارنة الفترة الحالية بالسابقة */}
              <Card
                title="مقارنة الفترة الحالية بالسابقة"
                subtitle={`مقارنة مع ${data.trend.previousSemester} — متابعة مسار التحسن أو التراجع`}
                action={
                  <div className="flex gap-1.5">
                    <Badge tone="emerald">⬆ تحسن {data.trend.improved}</Badge>
                    <Badge tone="rose">⬇ تراجع {data.trend.declined}</Badge>
                    <Badge tone="slate">↔ ثابت {data.trend.stable}</Badge>
                  </div>
                }
              >
                {data.trend.comparedCount === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    لا توجد بيانات للفصل السابق للمقارنة — رصد درجات الفصل الآخر ليظهر المسار.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[520px] text-right text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">الطالب</th>
                          <th className="px-3 py-2 font-bold">{data.trend.previousSemester}</th>
                          <th className="px-3 py-2 font-bold">الحالي</th>
                          <th className="px-3 py-2 font-bold">التغير</th>
                          <th className="px-3 py-2 font-bold">الاتجاه</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.trend.students
                          .filter((s) => s.previous > 0)
                          .map((s) => (
                            <tr key={s.id} className="hover:bg-brand-50/40">
                              <td className="px-3 py-2.5 font-semibold text-slate-800">{s.name}</td>
                              <td className="px-3 py-2.5 tabular-nums text-slate-500">
                                {s.previous}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-bold text-brand-700">
                                {s.current}
                              </td>
                              <td
                                className={`px-3 py-2.5 tabular-nums font-extrabold ${
                                  s.delta > 0
                                    ? "text-emerald-600"
                                    : s.delta < 0
                                      ? "text-rose-600"
                                      : "text-slate-500"
                                }`}
                              >
                                {s.delta > 0 ? "+" : ""}
                                {s.delta}
                              </td>
                              <td className="px-3 py-2.5">
                                {s.direction === "up" ? (
                                  <Badge tone="emerald">⬆ تحسن</Badge>
                                ) : s.direction === "down" ? (
                                  <Badge tone="rose">⬇ تراجع</Badge>
                                ) : (
                                  <Badge tone="slate">↔ ثابت</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* مقارنة المواد */}
              <Card title="مقارنة المواد" subtitle="المتوسط والنسبة ونسبة الإتقان لكل مادة">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">المادة</th>
                        <th className="px-3 py-2 font-bold">المُرصود</th>
                        <th className="px-3 py-2 font-bold">المتوسط</th>
                        <th className="px-3 py-2 font-bold">النسبة</th>
                        <th className="px-3 py-2 font-bold">الإتقان</th>
                        <th className="px-3 py-2 font-bold">الاجتياز</th>
                        <th className="px-3 py-2 font-bold">الأعلى/الأدنى</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.subjects.map((subject) => (
                        <tr key={subject.id} className="hover:bg-brand-50/40">
                          <td className="px-3 py-2.5 font-bold text-slate-800">{subject.name}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-500">
                            {subject.gradedCount}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-extrabold text-brand-700">
                            {subject.avg}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-slate-700">
                            {subject.pct}٪
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-emerald-600">
                            {subject.masteryRate}٪
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-sky-600">
                            {subject.passRate}٪
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">
                            <span className="text-emerald-600">{subject.highest}</span>
                            <span className="text-slate-400"> / </span>
                            <span className="text-rose-600">{subject.lowest}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* مقارنة الفصول والشعب */}
              <Card
                title="مقارنة الفصول والشعب"
                subtitle="لإبراز مواطن القوة وتفاوت التحصيل بين الفصول"
                action={<Badge tone="brand">{data.classes.length} فصل</Badge>}
              >
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[520px] text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">الفصل</th>
                        <th className="px-3 py-2 font-bold">الطلاب</th>
                        <th className="px-3 py-2 font-bold">المتوسط</th>
                        <th className="px-3 py-2 font-bold">النسبة</th>
                        <th className="px-3 py-2 font-bold">المقارنة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.classes.map((cls) => (
                        <tr
                          key={cls.id}
                          className={cls.current ? "bg-brand-50/60" : "hover:bg-brand-50/40"}
                        >
                          <td className="px-3 py-2.5 font-bold text-slate-800">
                            {GRADE_LABEL_PREFIX} {cls.grade} — {cls.section}
                            {cls.current && (
                              <span className="ms-1.5 text-[10px] font-bold text-brand-600">
                                (الحالي)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-500">
                            {cls.studentsCount}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-extrabold text-brand-700">
                            {cls.avg}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-bold text-slate-700">
                            {cls.pct}٪
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  cls.pct >= 75
                                    ? "bg-emerald-500"
                                    : cls.pct >= 50
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                                style={{ width: `${Math.min(100, cls.pct)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ============ المخرجات العملية ============ */}
          {tab === "actions" && (
            <div className="space-y-4">
              {/* خطط علاجية */}
              <Card
                title="🩺 خطط علاجية للمتعثرين"
                subtitle={`${data.actions.remedial.length} طالب أقل من ${data.mastery.passPct}٪`}
                action={<Badge tone="rose">{data.actions.remedial.length}</Badge>}
              >
                {data.actions.remedial.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    لا يوجد طلاب بحاجة إلى خطة علاجية — ممتاز!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.actions.remedial.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-rose-900">{r.name}</span>
                          <Badge tone="rose">{r.pct}٪</Badge>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-6 text-rose-800">
                          <b>الإجراء:</b> {r.action}
                        </p>
                        <p className="mt-1 text-[11px] text-rose-600">
                          مهارات متعثرة: {r.weakest.join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* خطط إثرائية */}
              <Card
                title="🚀 خطط إثرائية للمتفوقين"
                subtitle={`${data.actions.enrichment.length} طالب بلغ ٩٠٪ فأعلى`}
                action={<Badge tone="emerald">{data.actions.enrichment.length}</Badge>}
              >
                {data.actions.enrichment.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    لا يوجد طلاب في فئة المتفوقين حالياً.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.actions.enrichment.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-emerald-900">{e.name}</span>
                          <Badge tone="emerald">{e.pct}٪</Badge>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-6 text-emerald-800">{e.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* تغذية راجعة للأسرة */}
              <Card
                title="🏠 تغذية راجعة للأسرة"
                subtitle="رسالة عملية جاهزة لولي الأمر — توضّح نقطة القوة وما يحتاجه الطالب في المنزل"
                action={<Badge tone="sky">{data.actions.familyFeedback.length}</Badge>}
              >
                <div className="space-y-2">
                  {data.actions.familyFeedback.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-right"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-800">{f.name}</span>
                        <Badge tone={f.pct >= 50 ? "amber" : "rose"}>{f.pct}٪</Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-6 text-slate-600">{f.message}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* تعديل أساليب التدريس */}
              <Card
                title="👩‍🏫 تعديل أساليب التدريس والتقويم"
                subtitle="حيث ظهر تعثر جماعي في مهارة معينة"
                action={<Badge tone="violet">{data.actions.teachingAdjustments.length}</Badge>}
              >
                {data.actions.teachingAdjustments.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    لا يوجد تعثر جماعي في أي مهارة — الأساليب الحالية فعّالة.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.actions.teachingAdjustments.map((t, i) => (
                      <div
                        key={`${t.skill}-${i}`}
                        className="rounded-xl border border-violet-200 bg-violet-50 p-3.5 text-right"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-violet-900">{t.skill}</span>
                          <Badge tone="violet">{t.subject}</Badge>
                          <span className="text-[11px] text-violet-700">
                            تعثر {t.struggleCount}/{t.gradedCount} ({t.struggleRate}٪)
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-6 text-violet-800">
                          {t.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Alert kind="info">
                <b>خطوات سريعة:</b> ① جمّع البيانات من الاختبارات القصيرة والواجبات والملاحظات الصفية
                ② ابدأ بالمهارات التأسيسية الحرجة (القراءة والكتابة والعمليات الحسابية) ③ اربط كل نتيجة
                بإجراء تنفيذي واضح بزمن محدد — لا تكتفِ بجداول الأرقام.
              </Alert>
            </div>
          )}

          {/* ============ تحليل الطلاب ============ */}
          {tab === "students" && (
            <Card
              title="تحليل الطلاب"
              subtitle="مرتب تنازلياً بالمتوسط — مع نسبة الإتقان والاجتياز"
            >
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-bold">#</th>
                      <th className="px-3 py-2 font-bold">الطالب</th>
                      <th className="px-3 py-2 font-bold">مواد مرصودة</th>
                      <th className="px-3 py-2 font-bold">المجموع</th>
                      <th className="px-3 py-2 font-bold">المتوسط</th>
                      <th className="px-3 py-2 font-bold">النسبة</th>
                      <th className="px-3 py-2 font-bold">الإتقان</th>
                      <th className="px-3 py-2 font-bold">المستوى</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...data.students]
                      .sort((a, b) => b.pct - a.pct)
                      .map((student, index) => {
                        const level =
                          data.levels.find((l) =>
                            l.key === "exceptional"
                              ? student.pct >= 90
                              : l.key === "mastery"
                                ? student.pct >= 75 && student.pct < 90
                                : l.key === "followup"
                                  ? student.pct >= 50 && student.pct < 75
                                  : student.pct < 50,
                          ) ?? data.levels[3];
                        return (
                          <tr key={student.id} className="hover:bg-brand-50/40">
                            <td className="px-3 py-2.5 tabular-nums text-slate-400">
                              {student.classNumber ?? index + 1}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-800">
                              {student.name}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-500">
                              {student.gradedCount}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums font-bold text-slate-700">
                              {student.total}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums font-extrabold text-brand-700">
                              {student.avg}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums text-slate-600">
                              {student.pct}٪
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge tone={student.pct >= 75 ? "emerald" : "rose"}>
                                {student.pct >= 75 ? "متقناً" : "أقل"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold text-white ${LEVEL_TONE[level.key]}`}
                              >
                                {level.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
