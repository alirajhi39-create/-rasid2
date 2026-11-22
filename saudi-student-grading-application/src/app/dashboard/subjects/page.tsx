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
  GROUP_TARGET,
  ITEM_KINDS,
  PERIODS,
  SUBJECT_SUGGESTIONS,
  TEMPLATES,
  toGroup,
} from "@/lib/constants";
import { normalizeItems } from "@/lib/grades";
import type { ScoreItem, ScoreItemKind, ScoreGroup, ScorePeriod } from "@/db/schema";

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
  classroom_id: number | null;
  grade: string | null;
  section: string | null;
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

export default function SubjectsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
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
  const [modalClassroom, setModalClassroom] = useState<number | "">("");

  const [linkTarget, setLinkTarget] = useState<Subject | null>(null);
  const [linkValue, setLinkValue] = useState<number | "">("");
  const [moving, setMoving] = useState(false);

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
    setLoading(true);
    const res = await apiFetch<{ subjects: Subject[] }>("/api/subjects");
    if (res.ok && res.data) {
      setAllSubjects((res.data.subjects ?? []).map((s) => ({ ...s, items: normalizeItems(s.items ?? []) })));
    } else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [pushToast]);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  /* ------------------- تقسيم المواد حسب الربط ------------------- */
  const linkedSubjects = useMemo(
    () => (classroomId ? allSubjects.filter((s) => s.classroom_id === classroomId) : []),
    [allSubjects, classroomId],
  );
  const unlinkedSubjects = useMemo(
    () => allSubjects.filter((s) => !s.classroom_id),
    [allSubjects],
  );
  const otherSubjects = useMemo(
    () =>
      allSubjects.filter(
        (s) => s.classroom_id && (!classroomId || s.classroom_id !== classroomId),
      ),
    [allSubjects, classroomId],
  );

  /* ------------------- مجاميع المجموعات ------------------- */
  const groupSums = useMemo(() => {
    const out = {} as Record<ScoreGroup, { sum: number; count: number }>;
    for (const g of GROUPS) {
      const list = items.filter((i) => toGroup(i.group) === g.value);
      out[g.value] = {
        sum: list.reduce((s, i) => s + (Number(i.max) || 0), 0),
        count: list.length,
      };
    }
    return out;
  }, [items]);

  const totals = useMemo(
    () => ({
      performance: groupSums.performance.sum,
      written: groupSums.written.sum,
      total: groupSums.performance.sum + groupSums.written.sum,
    }),
    [groupSums],
  );

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setItems(normalizeItems(template.items.map((item) => ({ ...item, id: freshId() }))));
    setPassingScore("50");
    setActiveTemplate(templateId);
  }

  function openNew() {
    setEditing(null);
    setName("");
    setItems(normalizeItems(TEMPLATES[0].items.map((item) => ({ ...item, id: freshId() }))));
    setPassingScore("50");
    setActiveTemplate(TEMPLATES[0].id);
    setModalClassroom(classroomId ?? "");
    setModal(true);
  }

  function openEdit(subject: Subject) {
    setEditing(subject);
    setName(subject.name);
    setItems(normalizeItems((subject.items ?? []).map((i) => ({ ...i, id: i.id || freshId() }))));
    setPassingScore(String(Number(subject.passing_score)));
    setActiveTemplate("");
    setModalClassroom(subject.classroom_id ?? "");
    setModal(true);
  }

  function updateItem(index: number, patch: Partial<ScoreItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem(group: ScoreGroup) {
    setItems((prev) => [
      ...prev,
      {
        id: freshId(),
        label: group === "performance" ? "مهمة أدائية" : "تقويم تحريري",
        max: 10,
        group,
        kind: (group === "performance" ? "performance" : "written") as ScoreItemKind,
        period: "p1" as ScorePeriod,
      },
    ]);
  }

  /** توزيع الدرجات المتبقية بالتساوي على أعمدة المجموعة */
  function autoBalance(group: ScoreGroup) {
    const target = GROUP_TARGET[group];
    const idx = items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => toGroup(item.group) === group);
    if (idx.length === 0) {
      pushToast("error", "أضف عموداً واحداً على الأقل لهذه المجموعة أولاً");
      return;
    }
    const per = Math.round((target / idx.length) * 100) / 100;
    setItems((prev) =>
      prev.map((item, i) => (idx.some((x) => x.i === i) ? { ...item, max: per } : item)),
    );
    pushToast("info", `تم توزيع ${target} درجة على ${idx.length} عمود (${per} لكل عمود)`);
  }

  async function save() {
    if (!name.trim()) {
      pushToast("error", "أدخل اسم المادة");
      return;
    }
    const cleaned = normalizeItems(items)
      .map((item) => ({ ...item, label: item.label.trim(), max: Number(item.max) || 0 }))
      .filter((item) => item.label && item.max > 0);

    if (cleaned.length === 0) {
      pushToast("error", "أضف عموداً واحداً على الأقل مع اسم ودرجة عظمى");
      return;
    }

    setSaving(true);
    const res = await apiFetch(editing ? `/api/subjects/${editing.id}` : "/api/subjects", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify({
        name: name.trim(),
        classroomId: modalClassroom === "" ? null : Number(modalClassroom),
        items: cleaned,
        passingScore: Number(passingScore) || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      pushToast(
        "success",
        editing
          ? "تم تحديث المادة"
          : modalClassroom === ""
            ? "تم إضافة المادة (غير مرتبطة) — اربطها بالفصل لاحقاً"
            : "تم إضافة المادة وربطها بالفصل",
      );
      setModal(false);
      await loadSubjects();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "خطأ");
  }

  /* ---------------------- ربط / فك ربط مادة ---------------------- */
  async function applyLink(subject: Subject, target: number | null) {
    setMoving(true);
    const res = await apiFetch(`/api/subjects/${subject.id}`, {
      method: "PUT",
      body: JSON.stringify({ classroomId: target }),
    });
    setMoving(false);
    if (res.ok) {
      pushToast("success", target ? "تم ربط المادة بالفصل" : "تم فك ربط المادة — لن تُربط تلقائياً");
      setLinkTarget(null);
      setLinkValue("");
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

  /* ----------------------- بطاقة مادة ----------------------- */
  function SubjectCard({ subject }: { subject: Subject }) {
    const subjectItems = normalizeItems(subject.items ?? []);
    return (
      <div className="animate-fade-up rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold text-slate-800">{subject.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {subject.classroom_id ? (
                <>
                  {GRADE_LABEL_PREFIX} {subject.grade} — {subject.section}
                </>
              ) : (
                <span className="font-bold text-amber-600">🔓 غير مرتبطة بفصل</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {subject.classroom_id ? (
              <button
                type="button"
                onClick={() => void applyLink(subject, null)}
                disabled={moving}
                className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200 disabled:opacity-50"
                title="فك الربط — تبقى المادة ودرجاتها محفوظة باسمك"
              >
                فك الربط
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLinkTarget(subject);
                  setLinkValue(classroomId ?? "");
                }}
                className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200"
              >
                🔗 ربط بفصل
              </button>
            )}
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
            {GROUPS.map((g) => {
              const sum = subjectItems
                .filter((i) => toGroup(i.group) === g.value)
                .reduce((s, i) => s + Number(i.max || 0), 0);
              return (
                <Badge key={g.value} tone={g.tone}>
                  {g.label} {sum}
                </Badge>
              );
            })}
            <Badge tone="emerald">النجاح {Number(subject.passing_score)}</Badge>
            <Badge tone="slate">مرصود {subject.students_graded}</Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-bold">العمود</th>
                  <th className="px-3 py-2 font-bold">المجموعة</th>
                  <th className="px-3 py-2 font-bold">الفترة</th>
                  <th className="px-3 py-2 font-bold">العظمى</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjectItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold text-slate-700">{item.label}</td>
                    <td className="px-3 py-2">
                      <Badge tone={item.group === "performance" ? "sky" : "violet"}>
                        {item.group === "performance" ? "مهام أدائية" : "تحريري"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={item.period === "p1" ? "sky" : "amber"}>
                        {item.period === "p1" ? "ف١" : "ف٢"}
                      </Badge>
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
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">
            المواد وتوزيع الدرجات
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            المهام الأدائية <b>٤٠</b> درجة + التقويمات التحريرية <b>٦٠</b> درجة — بأعمدة متعددة تحت كل
            مجموعة
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
          <Button onClick={openNew}>➕ مادة جديدة</Button>
        </div>
      </div>

      {classrooms.length === 0 && (
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
      ) : (
        <div className="space-y-5">
          {/* مواد الفصل المحدد */}
          <Card
            title={
              currentClassroom
                ? `مواد ${GRADE_LABEL_PREFIX} ${currentClassroom.grade} — ${currentClassroom.section}`
                : "مواد الفصل"
            }
            subtitle={
              currentClassroom
                ? `${linkedSubjects.length} مادة مرتبطة بهذا الفصل · ${currentClassroom.students_count} طالب`
                : "اختر فصلاً لعرض مواده المرتبطة"
            }
            action={
              classroomId ? (
                <Button size="sm" onClick={openNew}>
                  + مادة لهذا الفصل
                </Button>
              ) : undefined
            }
          >
            {linkedSubjects.length === 0 ? (
              <EmptyState
                icon="📚"
                title={classroomId ? "لا توجد مواد مرتبطة بهذا الفصل" : "اختر فصلاً أولاً"}
                description="أضف مادة وحدّد أعمدة المهام الأدائية (٤٠) والتقويمات التحريرية (٦٠)، وستُربط تلقائياً بهذا الفصل."
                action={
                  classroomId ? (
                    <Button size="sm" onClick={openNew}>
                      إضافة مادة
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {linkedSubjects.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
              </div>
            )}
          </Card>

          {/* مواد غير مرتبطة */}
          {unlinkedSubjects.length > 0 && (
            <Card
              title="🔓 مواد غير مرتبطة بفصل"
              subtitle="محفوظة باسمك — اربطها بأحد فصولك لتظهر أسماء الطلاب ويصبح الرصد ممكناً"
              action={
                <Badge tone="amber">{unlinkedSubjects.length} مادة</Badge>
              }
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {unlinkedSubjects.map((subject) => (
                  <SubjectCard key={subject.id} subject={subject} />
                ))}
              </div>
            </Card>
          )}

          {/* مواد فصول أخرى */}
          {otherSubjects.length > 0 && (
            <Card
              title="مواد فصول أخرى"
              subtitle="موادك المرتبطة بفصول دراسية أخرى"
              action={<Badge tone="slate">{otherSubjects.length} مادة</Badge>}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {otherSubjects.map((subject) => {
                  const cls = classrooms.find((c) => c.id === subject.classroom_id);
                  return (
                    <div
                      key={subject.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{subject.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {GRADE_LABEL_PREFIX} {cls?.grade} — {cls?.section}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkTarget(subject);
                          setLinkValue(classroomId ?? "");
                        }}
                        className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        نقل لهذا الفصل
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
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
            <Field label="اسم المادة">
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
            <Field
              label="الفصل الدراسي المرتبط"
              hint="اختر «غير مرتبطة» لحفظها دون ربط — يمكنك ربطها لاحقاً ولن تُربط تلقائياً"
            >
              <Select
                value={String(modalClassroom)}
                onChange={(e) => setModalClassroom(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">🔓 غير مرتبطة بفصل</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="درجة النجاح" hint={`الافتراضي نصف المجموع (${Math.round(totals.total / 2)})`}>
            <Input
              type="number"
              min={1}
              value={passingScore}
              onChange={(e) => setPassingScore(e.target.value)}
            />
          </Field>

          {/* القوالب الجاهزة */}
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">
              قوالب جاهزة (٤٠ مهام أدائية + ٦٠ تقويمات تحريرية)
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

          {/* بنّاء الأعمدة حسب المجموعة */}
          {GROUPS.map((group) => {
            const groupItems = items
              .map((item, i) => ({ item, i }))
              .filter(({ item }) => toGroup(item.group) === group.value);
            const sum = groupSums[group.value].sum;
            const diff = Math.round((sum - group.targetMax) * 100) / 100;
            const balanced = Math.abs(diff) < 0.01;

            return (
              <div
                key={group.value}
                className={`rounded-2xl border p-3.5 ${group.bg} ${group.ring} ring-1`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-extrabold ${group.text}`}>
                      {group.label}
                      <span className="ms-2 text-[11px] font-normal text-slate-500">
                        الهدف {group.targetMax} درجة
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">{group.hint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={balanced ? "emerald" : diff > 0 ? "rose" : "amber"}>
                      {sum} / {group.targetMax}
                      {balanced ? " ✓" : diff > 0 ? ` (+${diff})` : ` (${diff})`}
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => autoBalance(group.value)}>
                      ⚖ توزيع تلقائي
                    </Button>
                    <Button size="sm" onClick={() => addItem(group.value)}>
                      + إضافة عمود
                    </Button>
                  </div>
                </div>

                {/* شريط التقدم نحو الهدف */}
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full transition-all ${
                      balanced ? "bg-emerald-500" : diff > 0 ? "bg-rose-500" : "bg-amber-400"
                    }`}
                    style={{ width: `${Math.min(100, (sum / group.targetMax) * 100)}%` }}
                  />
                </div>

                {groupItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-4 text-center text-[11px] text-slate-400">
                    لا توجد أعمدة — اضغط «إضافة عمود» لإضافة أي عدد تريده
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupItems.map(({ item, i }) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 items-end gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:grid-cols-[1fr_84px_120px_150px_36px]"
                      >
                        <div>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">
                            اسم العمود
                          </span>
                          <Input
                            value={item.label}
                            onChange={(e) => updateItem(i, { label: e.target.value })}
                            placeholder={group.value === "performance" ? "مهمة أدائية" : "تقويم تحريري"}
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
                            onChange={(e) => updateItem(i, { max: Number(e.target.value) })}
                            className="py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">
                            الفترة
                          </span>
                          <Select
                            value={item.period}
                            onChange={(e) => updateItem(i, { period: e.target.value as ScorePeriod })}
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
                            النوع
                          </span>
                          <Select
                            value={item.kind}
                            onChange={(e) => updateItem(i, { kind: e.target.value as ScoreItemKind })}
                            className="py-1.5 text-xs"
                          >
                            {ITEM_KINDS.filter((k) => k.group === group.value).map((k) => (
                              <option key={k.value} value={k.value}>
                                {k.icon} {k.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, x) => x !== i))}
                          className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                          aria-label="حذف العمود"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ملخص التوزيع */}
          <div className="rounded-2xl bg-gradient-to-l from-brand-700 to-brand-600 p-4 text-white">
            <p className="text-xs font-bold text-brand-100">
              ملخص توزيع الدرجات — لكل فصل دراسي
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/15 px-2 py-2.5">
                <p className="text-lg font-extrabold tabular-nums">{totals.performance}</p>
                <p className="text-[10px] text-brand-100">المهام الأدائية</p>
              </div>
              <div className="rounded-xl bg-white/15 px-2 py-2.5">
                <p className="text-lg font-extrabold tabular-nums">{totals.written}</p>
                <p className="text-[10px] text-brand-100">التقويمات التحريرية</p>
              </div>
              <div className="rounded-xl bg-white px-2 py-2.5 text-brand-700">
                <p className="text-lg font-extrabold tabular-nums">{totals.total}</p>
                <p className="text-[10px] text-brand-600">مجموع الفصل</p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-5 text-brand-100">
              عدد الأعمدة: {groupSums.performance.count} مهام أدائية + {groupSums.written.count} تقويم
              تحريري = {groupSums.performance.count + groupSums.written.count} عمود · مجموع الفصلين
              (السنوي) = <b>{totals.total * 2}</b>
            </p>
          </div>

          {totals.performance !== 40 && (
            <Alert kind={totals.performance > 40 ? "error" : "warn"}>
              مجموع المهام الأدائية <b>{totals.performance}</b> والمعتمد <b>٤٠</b> درجة — استخدم زر
              «توزيع تلقائي» للموازنة.
            </Alert>
          )}
          {totals.written !== 60 && (
            <Alert kind={totals.written > 60 ? "error" : "warn"}>
              مجموع التقويمات التحريرية <b>{totals.written}</b> والمعتمد <b>٦٠</b> درجة — استخدم زر
              «توزيع تلقائي» للموازنة.
            </Alert>
          )}
        </div>
      </Modal>

      {/* ============ نافذة ربط المادة بفصل ============ */}
      <Modal
        open={Boolean(linkTarget)}
        onClose={() => {
          setLinkTarget(null);
          setLinkValue("");
        }}
        title={`ربط مادة «${linkTarget?.name ?? ""}» بفصل دراسي`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setLinkTarget(null);
                setLinkValue("");
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => linkTarget && void applyLink(linkTarget, linkValue === "" ? null : Number(linkValue))}
              disabled={linkValue === "" || moving}
            >
              {moving ? (
                <>
                  <Spinner /> جارٍ الربط...
                </>
              ) : (
                "🔗 ربط المادة"
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="اختر الفصل" hint="يمكنك فك الربط في أي وقت ولن تُربط المادة تلقائياً">
            <Select
              value={String(linkValue)}
              onChange={(e) => setLinkValue(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">— اختر الفصل —</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage}) · {c.students_count} طالب
                </option>
              ))}
            </Select>
          </Field>
          <Alert kind="info">
            عند الربط ستظهر أسماء طلاب هذا الفصل في كشف رصد المادة، وتبقى الدرجات المحفوظة كما هي.
          </Alert>
        </div>
      </Modal>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
