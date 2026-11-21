"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import {
  GRADE_LABEL_PREFIX,
  GROUPS,
  ITEM_KINDS,
  PERIODS,
  SUBJECT_SUGGESTIONS,
  TEMPLATES,
  makeItem,
} from "@/lib/constants";
import { computePeriodTotal } from "@/lib/grades";
import type { ScoreItem, ScoreItemKind, ScorePeriod } from "@/db/schema";

type Classroom = {
  id: number;
  grade: string;
  section: string;
  stage: string;
  students_count: number;
  subjects_count: number;
};

type Subject = {
  id: number;
  name: string;
  classroom_id: number;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
  students_graded: number;
};

let counter = 0;
function freshId() {
  counter += 1;
  return `it_${Date.now().toString(36)}_${counter}`;
}

/** ضمان وجود حقل الفترة في الخانات القديمة */
function normalize(items: ScoreItem[]): ScoreItem[] {
  return items.map((item) => ({
    ...item,
    period: item.period === "p2" ? "p2" : "p1",
  }));
}

export default function SubjectsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<ScoreItem[]>([]);
  const [passingScore, setPassingScore] = useState("50");
  const [saving, setSaving] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string>("");

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const loadClassrooms = useCallback(async () => {
    const res = await apiFetch<{ classrooms: Classroom[] }>("/api/classrooms");
    if (res.ok && res.data) {
      setClassrooms(res.data.classrooms ?? []);
      setClassroomId((prev) => prev ?? res.data!.classrooms[0]?.id ?? null);
    } else if (res.error) pushToast("error", res.error);
  }, [pushToast]);

  const loadSubjects = useCallback(async () => {
    if (!classroomId) {
      setSubjects([]);
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ subjects: Subject[] }>(`/api/subjects?classroomId=${classroomId}`);
    if (res.ok && res.data) setSubjects(res.data.subjects ?? []);
    else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [classroomId, pushToast]);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const periodTotals = useMemo(
    () => ({
      p1: items.filter((i) => i.period === "p1").reduce((s, i) => s + (Number(i.max) || 0), 0),
      p2: items.filter((i) => i.period === "p2").reduce((s, i) => s + (Number(i.max) || 0), 0),
    }),
    [items],
  );
  const totals = {
    p1: periodTotals.p1,
    p2: periodTotals.p2,
    total: periodTotals.p1 + periodTotals.p2,
  };

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setItems(normalize(template.items.map((item) => ({ ...item, id: freshId() }))));
    setPassingScore("50");
    setActiveTemplate(templateId);
  }

  function openNew() {
    setEditing(null);
    setName("");
    setItems(normalize(TEMPLATES[1].items.map((item) => ({ ...item, id: freshId() }))));
    setPassingScore("50");
    setActiveTemplate(TEMPLATES[1].id);
    setModal(true);
  }

  function openEdit(subject: Subject) {
    setEditing(subject);
    setName(subject.name);
    setItems(normalize((subject.items ?? []).map((item) => ({ ...item, id: item.id || freshId() }))));
    setPassingScore(String(Number(subject.passing_score)));
    setActiveTemplate("");
    setModal(true);
  }

  function updateItem(index: number, patch: Partial<ScoreItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem(period: ScorePeriod) {
    setItems((prev) => [
      ...prev,
      {
        id: freshId(),
        label: "",
        max: 5,
        group: "year" as const,
        kind: "custom" as ScoreItemKind,
        period,
      },
    ]);
  }

  async function save() {
    if (!name.trim()) {
      pushToast("error", "أدخل اسم المادة");
      return;
    }
    if (items.length === 0) {
      pushToast("error", "أضف خانة واحدة على الأقل");
      return;
    }
    const cleaned = items
      .map((item) => ({
        ...item,
        label: item.label.trim(),
        max: Number(item.max) || 0,
        period: item.period === "p2" ? ("p2" as const) : ("p1" as const),
      }))
      .filter((item) => item.label && item.max > 0);

    if (cleaned.length === 0) {
      pushToast("error", "يجب تعبئة أسماء الخانات والدرجة العظمى");
      return;
    }

    setSaving(true);
    const res = await apiFetch(editing ? `/api/subjects/${editing.id}` : "/api/subjects", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({
        name: name.trim(),
        classroomId,
        items: cleaned,
        passingScore: Number(passingScore) || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      pushToast("success", editing ? "تم تحديث المادة" : "تم إضافة المادة وربطها بالفصل المحدد");
      setModal(false);
      await loadSubjects();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function remove(subject: Subject) {
    if (!confirm(`حذف مادة «${subject.name}» وكل الدرجات المرصدة فيها؟`)) return;
    const res = await apiFetch(`/api/subjects/${subject.id}`, { method: "DELETE" });
    if (res.ok) {
      pushToast("success", "تم حذف المادة");
      await loadSubjects();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "خطأ");
  }

  const currentClassroom = classrooms.find((c) => c.id === classroomId);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">المواد وتوزيع الدرجات</h1>
          <p className="mt-1 text-sm text-slate-500">
            كل مادة مرتبطة بفصل دراسي واحد فقط — والدرجات موزّعة على فترتي كل فصل دراسي
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(classroomId ?? "")}
            onChange={(e) => setClassroomId(Number(e.target.value))}
            className="w-52"
          >
            <option value="">— اختر الفصل —</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
              </option>
            ))}
          </Select>
          <Button onClick={openNew} disabled={!classroomId}>
            ➕ مادة جديدة
          </Button>
        </div>
      </div>

      {!classroomId && classrooms.length === 0 && (
        <Alert kind="warn">
          لا توجد فصول دراسية بعد.{" "}
          <Link href="/dashboard/students" className="font-bold underline">
            أضف فصلاً أولاً
          </Link>
        </Alert>
      )}

      {loading ? (
        <Card>
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner className="text-brand-600" /> جارٍ التحميل...
          </div>
        </Card>
      ) : subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon="📚"
            title={classroomId ? "لا توجد مواد لهذا الفصل" : "اختر فصلاً لعرض مواده"}
            description="أضف مادة دراسية وحدّد خانات توزيع الدرجات على فترتي الفصل الدراسي بما يناسب المرحلة."
            action={
              classroomId ? (
                <Button size="sm" onClick={openNew}>
                  إضافة مادة
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {subjects.map((subject) => {
            const items = normalize(subject.items ?? []);
            const p1 = items.filter((i) => i.period === "p1");
            const p2 = items.filter((i) => i.period === "p2");
            const p1Max = p1.reduce((s, i) => s + Number(i.max || 0), 0);
            const p2Max = p2.reduce((s, i) => s + Number(i.max || 0), 0);
            return (
              <div
                key={subject.id}
                className="animate-fade-up rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur"
              >
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-slate-800">{subject.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {GRADE_LABEL_PREFIX} {currentClassroom?.grade} — {currentClassroom?.section}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Link
                      href={`/dashboard/grades?subjectId=${subject.id}`}
                      className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
                    >
                      رصد
                    </Link>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(subject)}>
                      تعديل
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(subject)}>
                      حذف
                    </Button>
                  </div>
                </header>
                <div className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="brand">المجموع {Number(subject.total_max)}</Badge>
                    <Badge tone="sky">الفترة الأولى {p1Max}</Badge>
                    <Badge tone="violet">الفترة الثانية {p2Max}</Badge>
                    <Badge tone="emerald">النجاح {Number(subject.passing_score)}</Badge>
                    <Badge tone="slate">مرصود {subject.students_graded}</Badge>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">بند التوزيع</th>
                          <th className="px-3 py-2 font-bold">الفترة</th>
                          <th className="px-3 py-2 font-bold">المجموعة</th>
                          <th className="px-3 py-2 font-bold">العظمى</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 font-semibold text-slate-700">{item.label}</td>
                            <td className="px-3 py-2">
                              <Badge tone={item.period === "p1" ? "sky" : "violet"}>
                                {item.period === "p1" ? "الأولى" : "الثانية"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {item.group === "year" ? "أعمال السنة" : "النهائي"}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-bold text-slate-600">{item.max}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ نافذة بناء المادة ============ */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? "تعديل المادة وتوزيع الدرجات" : "إضافة مادة دراسية"}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Spinner /> جارٍ الحفظ...
                </>
              ) : editing ? (
                "حفظ التعديلات"
              ) : (
                "إضافة المادة"
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="اسم المادة"
              hint={currentClassroom ? `سيتم ربطها بـ ${GRADE_LABEL_PREFIX} ${currentClassroom.grade} — ${currentClassroom.section}` : undefined}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: الرياضيات"
                list="subject-suggestions"
              />
              <datalist id="subject-suggestions">
                {SUBJECT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="درجة النجاح" hint={`الافتراضي نصف المجموع (${Math.round(totals.total / 2)})`}>
              <Input
                type="number"
                min={1}
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
              />
            </Field>
          </div>

          {/* القوالب الجاهزة */}
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">
              قوالب جاهزة (توزّع الخانات على فترتي الفصل الدراسي)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className={`rounded-xl border p-3 text-right transition ${
                    activeTemplate === template.id
                      ? "border-brand-400 bg-brand-50/70 ring-2 ring-brand-100"
                      : "border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/40"
                  }`}
                >
                  <p className="text-xs font-extrabold text-slate-800">{template.title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{template.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* بناء الخانات حسب الفترة */}
          {PERIODS.map((period) => {
            const periodItems = items.filter((i) => i.period === period.value);
            const periodMax = periodItems.reduce((s, i) => s + (Number(i.max) || 0), 0);
            return (
              <div key={period.value} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">
                      {period.label}
                      <span className="ms-2 text-[11px] font-normal text-slate-500">{period.hint}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      لكل فصل دراسي — الدرجة العظمى للفترة: {periodMax}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={period.value === "p1" ? "sky" : "violet"}>{periodMax} درجة</Badge>
                    <Button size="sm" variant="secondary" onClick={() => addItem(period.value)}>
                      + خانة
                    </Button>
                  </div>
                </div>

                {periodItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-4 text-center text-[11px] text-slate-400">
                    لا توجد خانات في هذه الفترة — يمكنك تركها فارغة
                  </p>
                ) : (
                  <div className="space-y-2">
                    {periodItems.map((item) => {
                      const index = items.indexOf(item);
                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 items-end gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:grid-cols-[1fr_88px_140px_140px_36px]"
                        >
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-slate-400">
                              اسم البند
                            </span>
                            <Input
                              value={item.label}
                              onChange={(e) => updateItem(index, { label: e.target.value })}
                              placeholder="مثال: المهام الأدائية"
                              className="py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-slate-400">
                              العظمى
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step="0.5"
                              value={item.max}
                              onChange={(e) => updateItem(index, { max: Number(e.target.value) })}
                              className="py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-slate-400">
                              الفترة
                            </span>
                            <Select
                              value={item.period}
                              onChange={(e) =>
                                updateItem(index, { period: e.target.value as ScorePeriod })
                              }
                              className="py-1.5 text-xs"
                            >
                              {PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold text-slate-400">
                              المجموعة / النوع
                            </span>
                            <Select
                              value={item.kind}
                              onChange={(e) =>
                                updateItem(index, { kind: e.target.value as ScoreItemKind })
                              }
                              className="py-1.5 text-xs"
                            >
                              {GROUPS.map((g) => (
                                <optgroup key={g.value} label={g.label}>
                                  {ITEM_KINDS.filter((k) =>
                                    g.value === "year"
                                      ? ["performance", "participation", "homework", "quiz", "custom"].includes(
                                          k.value,
                                        )
                                      : ["written", "practical", "custom"].includes(k.value),
                                  ).map((k) => (
                                    <option key={k.value} value={k.value}>
                                      {k.icon} {k.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </Select>
                          </div>
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                            className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                            aria-label="حذف الخانة"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ملخص التوزيع */}
          <div className="rounded-2xl bg-gradient-to-l from-brand-700 to-brand-600 p-4 text-white">
            <p className="text-xs font-bold text-brand-100">
              ملخص توزيع الدرجات — لكل فصل دراسي (يتكرر في الفصلين الأول والثاني)
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/15 px-2 py-2.5">
                <p className="text-lg font-extrabold tabular-nums">{totals.p1}</p>
                <p className="text-[10px] text-brand-100">الفترة الأولى</p>
              </div>
              <div className="rounded-xl bg-white/15 px-2 py-2.5">
                <p className="text-lg font-extrabold tabular-nums">{totals.p2}</p>
                <p className="text-[10px] text-brand-100">الفترة الثانية</p>
              </div>
              <div className="rounded-xl bg-white px-2 py-2.5 text-brand-700">
                <p className="text-lg font-extrabold tabular-nums">{totals.total}</p>
                <p className="text-[10px] text-brand-600">مجموع الفصل</p>
              </div>
            </div>
            {totals.total > 0 && (
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full bg-sky-300"
                  style={{ width: `${(totals.p1 / totals.total) * 100}%` }}
                />
                <div
                  className="h-full bg-violet-300"
                  style={{ width: `${(totals.p2 / totals.total) * 100}%` }}
                />
              </div>
            )}
            <p className="mt-2.5 text-[11px] leading-5 text-brand-100">
              مجموع الفصلين (السنوي) = {totals.total} × ٢ = <b>{totals.total * 2}</b> · المتوسط بين الفصلين يُحسب
              تلقائياً في كشف الرصد والتقارير.
            </p>
          </div>

          {Number(passingScore) > totals.total && totals.total > 0 && (
            <Alert kind="error">درجة النجاح أكبر من مجموع الفصل الدراسي!</Alert>
          )}
        </div>
      </Modal>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
