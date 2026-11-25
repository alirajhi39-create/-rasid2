"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import {
  GRADE_LABEL_PREFIX,
  GROUP_LABEL,
  SEMESTERS,
  SEMESTER_LABEL,
} from "@/lib/constants";
import {
  computeGroupTotal,
  DEFAULT_THRESHOLDS,
  getRating,
  periodAverage,
  thresholdsFrom,
} from "@/lib/grades";
import type { GradeValues, ScoreGroup, ScoreItem, Semester } from "@/db/schema";

type Classroom = { id: number; grade: string; section: string; stage: string };
type Subject = {
  id: number;
  name: string;
  total_max: string;
  passing_score: string;
  items: ScoreItem[];
};
type Student = {
  id: number;
  full_name: string;
  class_number: number | null;
  guardian_phone: string | null;
  classroom_id: number;
};
type GradeRow = {
  studentId: number;
  fullName: string;
  classNumber: number | null;
  values: GradeValues;
  total: number;
};

const TEMPLATE_KEY = "rasd_whatsapp_template";

const DEFAULT_TEMPLATE = `السلام عليكم 🌿
نتيجة الطالب/ة: {name}
المادة: {subject}
الفصل: {class} — {semester}

{groups}
المجموع: {total} من {max} ({pct}٪)
متوسط الفترتين: {periodAvg}
التقدير: {rating} — {status}

مع تحيات نظام رَصْد 📚`;

const PLACEHOLDERS: { token: string; desc: string }[] = [
  { token: "{name}", desc: "اسم الطالب" },
  { token: "{subject}", desc: "اسم المادة" },
  { token: "{class}", desc: "الصف والشعبة" },
  { token: "{semester}", desc: "الفصل الدراسي" },
  { token: "{groups}", desc: "تفصيل مجموعات الدرجات" },
  { token: "{total}", desc: "المجموع المحصل" },
  { token: "{max}", desc: "الدرجة العظمى" },
  { token: "{pct}", desc: "النسبة المئوية" },
  { token: "{periodAvg}", desc: "متوسط الفترتين" },
  { token: "{rating}", desc: "التقدير" },
  { token: "{status}", desc: "ناجح / راسب" },
];

type Context = {
  name: string;
  subject: string;
  class: string;
  semester: string;
  groups: string;
  total: number;
  max: number;
  pct: number;
  periodAvg: number;
  rating: string;
  status: string;
};

function renderTemplate(template: string, ctx: Context): string {
  return template
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{subject\}/g, ctx.subject)
    .replace(/\{class\}/g, ctx.class)
    .replace(/\{semester\}/g, ctx.semester)
    .replace(/\{groups\}/g, ctx.groups)
    .replace(/\{total\}/g, String(ctx.total))
    .replace(/\{max\}/g, String(ctx.max))
    .replace(/\{pct\}/g, String(ctx.pct))
    .replace(/\{periodAvg\}/g, String(ctx.periodAvg))
    .replace(/\{rating\}/g, ctx.rating)
    .replace(/\{status\}/g, ctx.status);
}

export default function NotificationsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester>("first");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [loading, setLoading] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  /* ------------------------------ التحميل ------------------------------ */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(TEMPLATE_KEY);
      if (saved) setTemplate(saved);
    }
    (async () => {
      const res = await apiFetch<{ classrooms: Classroom[] }>("/api/classrooms");
      if (res.ok && res.data) {
        const list = res.data.classrooms ?? [];
        setClassrooms(list);
        setClassroomId((p) => p ?? list[0]?.id ?? null);
      }
      const settings = await apiFetch<{
        settings: { pctExcellent?: number; pctVgood?: number; pctGood?: number; pctPass?: number };
      }>("/api/settings");
      if (settings.ok && settings.data?.settings)
        setThresholds(thresholdsFrom(settings.data.settings));
    })();
  }, [pushToast]);

  useEffect(() => {
    if (!classroomId) return;
    (async () => {
      const res = await apiFetch<{ subjects: Subject[] }>(`/api/subjects?classroomId=${classroomId}`);
      if (res.ok && res.data) {
        const list = res.data.subjects ?? [];
        setSubjects(list);
        setSubjectId((p) => (p && list.some((s) => s.id === p) ? p : (list[0]?.id ?? null)));
      }
      const st = await apiFetch<{ students: Student[] }>(
        `/api/students?classroomId=${classroomId}`,
      );
      if (st.ok && st.data) setStudents(st.data.students ?? []);
    })();
  }, [classroomId]);

  useEffect(() => {
    if (!subjectId) {
      setGrades([]);
      return;
    }
    (async () => {
      setLoading(true);
      const res = await apiFetch<{ rows: GradeRow[] }>(
        `/api/grades?subjectId=${subjectId}&semester=${semester}`,
      );
      if (res.ok && res.data) setGrades(res.data.rows ?? []);
      setLoading(false);
    })();
  }, [subjectId, semester]);

  /* ------------------------------ البناء ------------------------------ */
  const subject = subjects.find((s) => s.id === subjectId);
  const classroom = classrooms.find((c) => c.id === classroomId);
  const totalMax = Number(subject?.total_max ?? 100);
  const passingScore = Number(subject?.passing_score ?? 50);

  /** دمج الطلاب بأرقامهم ودرجاتهم */
  const rows = useMemo(() => {
    const gradeMap = new Map(grades.map((g) => [g.studentId, g]));
    const out: { student: Student; grade: GradeRow }[] = [];
    for (const student of students) {
      const grade = gradeMap.get(student.id);
      if (grade) out.push({ student, grade });
    }
    return out;
  }, [students, grades]);

  const buildContext = useCallback(
    (student: Student, grade: GradeRow): Context => {
      const items = subject?.items ?? [];
      const groupKeys: ScoreGroup[] = ["performance", "written", "oral"];
      const groups = groupKeys
        .map((g) => {
          const got = computeGroupTotal(items, grade.values, g).got;
          const max = items.filter((i) => i.group === g).reduce((s, i) => s + i.max, 0);
          return max > 0 ? `${GROUP_LABEL[g]}: ${got} / ${max}` : "";
        })
        .filter(Boolean)
        .join("\n");

      const pct = totalMax > 0 ? Math.round((grade.total / totalMax) * 100) : 0;
      const rating = getRating(grade.total, totalMax, passingScore, thresholds);
      const pAvg = periodAverage(items, grade.values);

      return {
        name: student.full_name,
        subject: subject?.name ?? "",
        class: classroom
          ? `${GRADE_LABEL_PREFIX} ${classroom.grade} — الشعبة ${classroom.section}`
          : "",
        semester: SEMESTER_LABEL[semester],
        groups,
        total: grade.total,
        max: totalMax,
        pct,
        periodAvg: pAvg,
        rating: rating.label,
        status: rating.passed ? "ناجح ✔" : "راسب ✘",
      };
    },
    [subject, classroom, semester, totalMax, passingScore, thresholds],
  );

  /* ------------------------------ الإرسال ------------------------------ */
  const sendMessage = (student: Student, grade: GradeRow) => {
    const phone = (student.guardian_phone ?? "").replace(/\D/g, "");
    if (!phone) {
      pushToast("error", `لا يوجد رقم واتساب لولي أمر ${student.full_name}`);
      return;
    }
    const message = renderTemplate(template, buildContext(student, grade));
    // واتساب أو الرسائل النصية (SMS) — يفتح تطبيق الرسائل بالنص المُعبّأ
    const url =
      channel === "sms"
        ? `sms:${phone}?body=${encodeURIComponent(message)}`
        : `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setPreviewId(student.id);
  };

  /** تصدير ملف إرسال دفعة واحدة (CSV): رقم + الاسم + الرسالة
   *  يُستورد مباشرة في بوابات الرسائل النصية (يونيفوني / جوال) أو Excel */
  const exportBatch = () => {
    const queue = rows.filter(({ student }) => selected.has(student.id) && student.guardian_phone);
    if (queue.length === 0) {
      pushToast("error", "اختر طلاباً لديهم أرقام مسجّلة أولاً");
      return;
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      "phone,student_name,message",
      ...queue.map(({ student, grade }) =>
        [
          escape((student.guardian_phone ?? "").replace(/\D/g, "")),
          escape(student.full_name),
          escape(renderTemplate(template, buildContext(student, grade))),
        ].join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `رسائل-${subject?.name ?? "النتائج"}-${semester}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    pushToast("success", `صُدِّر ملف ${queue.length} رسالة — افتحه في بوابة الرسائل`);
  };

  /** نسخ كل رسائل الطلاب المحددة دفعة واحدة (مفصولة بخط فارغ) */
  const copyAll = async () => {
    const queue = rows.filter(({ student }) => selected.has(student.id));
    if (queue.length === 0) {
      pushToast("error", "اختر طلاباً أولاً");
      return;
    }
    const text = queue
      .map(({ student, grade }) =>
        `— ${student.full_name} (${student.guardian_phone ?? "بدون رقم"}) —\n${renderTemplate(
          template,
          buildContext(student, grade),
        )}`,
      )
      .join("\n\n━━━━━━━━━━━━━━━\n\n");
    await navigator.clipboard?.writeText(text);
    pushToast("success", `نُسخت ${queue.length} رسالة — الصقها أينما أردت`);
  };

  /** إرسال متتابع: يفتح أول طالب محدد غير مُرسل */
  const sendNext = () => {
    const queue = rows.filter(({ student }) => selected.has(student.id));
    if (queue.length === 0) {
      pushToast("error", "اختر طلاباً أولاً من القائمة");
      return;
    }
    const next = queue.find(({ student }) => student.id !== previewId) ?? queue[0];
    sendMessage(next.student, next.grade);
    pushToast(
      "info",
      `فتح محادثة ${next.student.full_name} — أرسل ثم اضغط «التالي» للمحادثة التالية`,
    );
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const withPhone = rows.filter(({ student }) => student.guardian_phone);
  const selectedCount = [...selected].length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">
            الإرسال الجماعي عبر واتساب
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            إرسال إشعارات ونتائج الطلاب لأرقام أولياء الأمور المرتبطة — مع تحكم كامل في صيغة الرسالة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* قناة الإرسال */}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: "whatsapp" as const, label: "🟢 واتساب" },
              { id: "sms" as const, label: "✉️ رسائل نصية" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChannel(opt.id)}
                title={
                  opt.id === "whatsapp"
                    ? "يفتح محادثة واتساب بالنص المُعبّأ"
                    : "يفتح تطبيق الرسائل النصية SMS بالنص المُعبّأ"
                }
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  channel === opt.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Select
            value={String(classroomId ?? "")}
            onChange={(e) => setClassroomId(e.target.value ? Number(e.target.value) : null)}
            className="w-52"
          >
            <option value="">— الفصل —</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {GRADE_LABEL_PREFIX} {c.grade} — {c.section}
              </option>
            ))}
          </Select>
          <Select
            value={String(subjectId ?? "")}
            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
            disabled={!classroomId}
            className="w-52"
          >
            <option value="">— المادة —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={semester}
            onChange={(e) => setSemester(e.target.value as Semester)}
            className="w-44"
          >
            {SEMESTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!classroomId ? (
        <Card>
          <EmptyState icon="💬" title="اختر فصلاً ومادة لبدء الإرسال" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          {/* القائمة */}
          <Card
            title="قائمة الطلاب"
            subtitle={`${rows.length} طالباً · ${withPhone.length} لديهم رقم واتساب`}
            action={
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(new Set(withPhone.map(({ student }) => student.id)))}
                >
                  تحديد الكل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  إلغاء
                </Button>
                <Button size="sm" onClick={sendNext} disabled={selectedCount === 0}>
                  {channel === "whatsapp" ? "🟢" : "✉️"} إرسال متتابع
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyAll}
                  disabled={selectedCount === 0}
                  title="نسخ رسائل جميع الطلاب المحددين دفعة واحدة"
                >
                  📋 نسخ الكل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportBatch}
                  disabled={selectedCount === 0}
                  title="تصدير CSV (رقم + رسالة) لبوابات الرسائل النصية"
                >
                  ⬇️ تصدير دفعة
                </Button>
              </div>
            }
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Spinner className="text-brand-600" /> جارٍ التحميل...
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon="👨‍🎓"
                title="لا توجد درجات لهذه المادة"
                description="ابدأ رصد الدرجات أولاً حتى تظهر النتائج هنا."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-bold">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-brand-600"
                          checked={selectedCount > 0 && selectedCount === withPhone.length}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(withPhone.map(({ student }) => student.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2 font-bold">الطالب</th>
                      <th className="px-3 py-2 font-bold">رقم واتساب</th>
                      <th className="px-3 py-2 font-bold">المجموع</th>
                      <th className="px-3 py-2 font-bold">التقدير</th>
                      <th className="px-3 py-2 font-bold">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(({ student, grade }) => {
                      const pct = totalMax > 0 ? Math.round((grade.total / totalMax) * 100) : 0;
                      const rating = getRating(grade.total, totalMax, passingScore, thresholds);
                      const hasPhone = Boolean(student.guardian_phone);
                      return (
                        <tr key={student.id} className="hover:bg-brand-50/40">
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-brand-600"
                              disabled={!hasPhone}
                              checked={selected.has(student.id)}
                              onChange={() => toggle(student.id)}
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {student.full_name}
                            <span className="block text-[10px] text-slate-400">
                              {student.class_number ? `رقم ${student.class_number}` : ""}
                            </span>
                          </td>
                          <td dir="ltr" className="px-3 py-2 text-right font-mono text-xs">
                            {hasPhone ? (
                              student.guardian_phone
                            ) : (
                              <span className="text-rose-500">غير مسجّل</span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-bold text-slate-700">
                            {grade.total}/{totalMax}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={rating.passed ? "emerald" : "rose"}>
                              {rating.label} ({pct}٪)
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant={hasPhone ? "success" : "secondary"}
                              disabled={!hasPhone}
                              onClick={() => sendMessage(student, grade)}
                            >
                              {channel === "whatsapp" ? "🟢 إرسال" : "✉️ رسالة"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* صيغة الرسالة */}
          <div className="space-y-4">
            <Card title="صيغة الرسالة" subtitle="تُحفظ تلقائياً في هذا المتصفح">
              <Field label="نص الرسالة">
                <Textarea
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    if (typeof window !== "undefined")
                      window.localStorage.setItem(TEMPLATE_KEY, e.target.value);
                  }}
                  className="min-h-64 text-xs leading-6"
                />
              </Field>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.token}
                    type="button"
                    title={p.desc}
                    onClick={() => setTemplate((t) => `${t}${t.endsWith("\n") ? "" : "\n"}${p.token}`)}
                    className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 transition hover:bg-brand-100 hover:text-brand-700"
                  >
                    {p.token}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                اضغط على الرمز لإضافته إلى نهاية النص — التغييرات تُحفظ تلقائياً.
              </p>

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTemplate(DEFAULT_TEMPLATE);
                    if (typeof window !== "undefined")
                      window.localStorage.setItem(TEMPLATE_KEY, DEFAULT_TEMPLATE);
                    pushToast("info", "أُعيدت الصيغة الافتراضية");
                  }}
                >
                  إعادة الافتراضي
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(template);
                    pushToast("success", "نُسخ نص الرسالة");
                  }}
                >
                  نسخ النص
                </Button>
              </div>
            </Card>

            <Card title="معاينة" subtitle={previewId ? "لآخر طالب فُتحت محادثته" : "اختر طالباً"}>
              {(() => {
                const target =
                  rows.find(({ student }) => student.id === previewId) ??
                  rows.find(({ student }) => selected.has(student.id)) ??
                  rows[0];
                if (!target) {
                  return <p className="text-xs text-slate-400">لا توجد بيانات للمعاينة</p>;
                }
                const message = renderTemplate(
                  template,
                  buildContext(target.student, target.grade),
                );
                return (
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold text-slate-500">
                      إلى: {target.student.full_name} — {target.student.guardian_phone ?? "بدون رقم"}
                    </p>
                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-emerald-50 p-3 text-[11px] leading-6 text-slate-700 ring-1 ring-emerald-100">
                      {message}
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>
        </div>
      )}

      <Alert kind="info">
        <b>قناة الإرسال:</b> «واتساب» يفتح محادثة جاهزة، و«رسائل نصية SMS» يفتح تطبيق الرسائل بالنص
        المُعبّأ — كلاهما بإشرافك. <b>للإرسال الدفعة واحدة:</b> اختر الطلاب ثم «📋 نسخ الكل» لنسخ كل
        الرسائل معاً، أو «⬇️ تصدير دفعة» لملف CSV (رقم + الاسم + الرسالة) يُستورد مباشرة في بوابات
        الرسائل النصية (يونيفوني / جوال / Excel) ويُرسل للجميع دفعة واحدة.
      </Alert>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
