"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client";
import { Badge, Button, Card, EmptyState, Select, Spinner, Toasts, type ToastItem } from "@/components/ui";
import { GRADE_LABEL_PREFIX, SEMESTERS, SEMESTER_LABEL } from "@/lib/constants";
import type { Semester } from "@/db/schema";

type Classroom = { id: number; grade: string; section: string; stage: string; students_count: number };
type Subject = {
  id: number;
  name: string;
  total_max: string;
  passing_score: string;
  students_graded: number;
  items: { id: string; label: string; max: number; group: string }[];
};

export default function ReportsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [semester, setSemester] = useState<Semester>("first");
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
      if (res.ok && res.data) setClassrooms(res.data.classrooms ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!classroomId) {
      setSubjects([]);
      setSubjectId(null);
      return;
    }
    setLoading(true);
    (async () => {
      const res = await apiFetch<{ subjects: Subject[] }>(`/api/subjects?classroomId=${classroomId}`);
      if (res.ok && res.data) {
        setSubjects(res.data.subjects ?? []);
        setSubjectId(res.data.subjects?.[0]?.id ?? null);
      }
      setLoading(false);
    })();
  }, [classroomId]);

  const subject = subjects.find((s) => s.id === subjectId);
  const classroom = classrooms.find((c) => c.id === classroomId);

  const print = (path: string) => {
    if (!subjectId) {
      pushToast("error", "اختر المادة أولاً");
      return;
    }
    window.open(`${path}?subjectId=${subjectId}&semester=${semester}`, "_blank");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">التقارير والطباعة والتصدير</h1>
        <p className="mt-1 text-sm text-slate-500">
          كشوف رسمية بترويسة وزارة التعليم قابلة للطباعة، وتصدير Excel مطابق لقوالب نظام نور
        </p>
      </div>

      <Card title="اختيار الكشف" subtitle="حدد الفصل ثم المادة">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            value={String(classroomId ?? "")}
            onChange={(e) => setClassroomId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— اختر الفصل —</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
              </option>
            ))}
          </Select>
          <Select
            value={String(subjectId ?? "")}
            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
            disabled={!classroomId || loading}
          >
            <option value="">— اختر المادة —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={semester}
            onChange={(e) => setSemester(e.target.value as Semester)}
            disabled={!subjectId}
          >
            {SEMESTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Spinner className="text-brand-600" /> جارٍ التحميل...
          </div>
        )}

        {subject && classroom && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="brand">
              {GRADE_LABEL_PREFIX} {classroom.grade} — {classroom.section}
            </Badge>
            <Badge tone="violet">{subject.name}</Badge>
            <Badge tone="emerald">المجموع {Number(subject.total_max)}</Badge>
            <Badge tone="sky">النجاح {Number(subject.passing_score)}</Badge>
            <Badge tone="slate">مرصود {subject.students_graded}</Badge>
            <Badge tone="amber">{SEMESTER_LABEL[semester]}</Badge>
          </div>
        )}
      </Card>

      {subject && classroom ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: "📄",
              title: "كشف درجات الفصل",
              text: "كشف رسمي كامل بجميع الطلاب وبنود التوزيع، مع خانات التوقيع — جاهز للطباعة على A4.",
              action: () => print("/print/class"),
              cta: "طباعة الكشف",
              tone: "from-brand-500 to-brand-700",
            },
            {
              icon: "🧾",
              title: "إشعارات فردية للطلاب",
              text: `إشعار مستقل لكل طالب يوضح درجاته في فترتي ${SEMESTER_LABEL[semester]} ومجموعه ومجموع الفصلين والمتوسط.`,
              action: () => print("/print/notices"),
              cta: "طباعة الإشعارات",
              tone: "from-violet-500 to-violet-700",
            },
            {
              icon: "📅",
              title: `كشف مجموع الفصلين والمتوسط`,
              text: "كشف سنوي يجمع مجموع الفصل الدراسي الأول والثاني مع المجموع الكلي والمتوسط لكل طالب.",
              action: () => print("/print/year"),
              cta: "طباعة الكشف السنوي",
              tone: "from-slate-700 to-slate-900",
            },
            {
              icon: "📊",
              title: "تصدير Excel لنظام نور",
              text: "ملف .xlsx بثلاث أوراق: كشف الدرجات، توزيع الدرجات، والملخص الإحصائي — بترتيب أعمدة مناسب للاستيراد.",
              action: () => {
                window.location.href = `/api/export?subjectId=${subjectId}`;
              },
              cta: "تنزيل الملف",
              tone: "from-emerald-500 to-emerald-700",
            },
            {
              icon: "🖨️",
              title: "إشعار طالب محدد",
              text: "اطبع إشعاراً لطالب واحد فقط — مفيد لمنسوبي المادة أو عند إعادة الرصد.",
              action: () => print("/print/notices"),
              cta: "طباعة",
              tone: "from-amber-500 to-orange-600",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="animate-fade-up rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur"
            >
              <div
                className={`mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${card.tone} text-xl text-white shadow`}
              >
                {card.icon}
              </div>
              <h3 className="text-sm font-extrabold text-slate-800">{card.title}</h3>
              <p className="mt-1.5 text-xs leading-6 text-slate-500">{card.text}</p>
              <Button className="mt-4 w-full" onClick={card.action}>
                {card.cta}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="🖨️"
            title="لم يتم التحديد"
            description="اختر الفصل الدراسي والمادة لعرض خيارات الطباعة والتصدير المتاحة."
          />
        </Card>
      )}

      <Card title="ملاحظات حول الطباعة" subtitle="للحصول على أفضل نتيجة">
        <ul className="space-y-2 text-xs leading-6 text-slate-600">
          <li>• اختر <b>A4 بالعرض (Landscape)</b> لكشوف الفصل الكاملة من نافذة الطباعة.</li>
          <li>• اختر <b>A4 بالطول (Portrait)</b> للإشعارات الفردية.</li>
          <li>• فعّل خيار <b>طباعة الخلفيات / Background graphics</b> لظهور الترويسة الرسمية.</li>
          <li>• يمكنك تعديل اسم المدرسة والإدارة والفصل الدراسي من صفحة الإعدادات.</li>
          <li>• تصدير Excel يُنزَّل مباشرة من الخادم بصيغة .xlsx متوافقة مع نظام نور.</li>
        </ul>
      </Card>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
