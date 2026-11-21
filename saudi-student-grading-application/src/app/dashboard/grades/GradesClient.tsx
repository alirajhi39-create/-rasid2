"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Spinner,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import {
  GRADE_LABEL_PREFIX,
  KIND_LABEL,
  PERIOD_SHORT,
  SEMESTERS,
  SEMESTER_LABEL,
  SEMESTER_SHORT,
} from "@/lib/constants";
import {
  computePeriodTotal,
  computeTotal,
  gradeColorClasses,
  round2,
  statsFor,
  toPeriod,
  yearAverage,
  yearTotal,
} from "@/lib/grades";
import type { GradeValues, ScoreItem, Semester } from "@/db/schema";

type Classroom = { id: number; grade: string; section: string; stage: string };
type Subject = {
  id: number;
  name: string;
  total_max: string;
  passing_score: string;
  students_graded: number;
  classroom_id: number;
};

type Row = {
  studentId: number;
  fullName: string;
  nationalId: string | null;
  classNumber: number | null;
  values: GradeValues;
  total: number;
};

type SummaryRow = {
  studentId: number;
  fullName: string;
  classNumber: number | null;
  first: number;
  second: number;
  yearTotal: number;
  yearAvg: number;
};

type SummaryStats = {
  count: number;
  gradedFirst: number;
  gradedSecond: number;
  avgFirst: number;
  avgSecond: number;
  avgYear: number;
  avgMean: number;
  yearMax: number;
  passedYear: number;
  semestersUsed: number;
};

type SaveState = { status: "idle" | "saving" | "saved" | "error"; at?: string };

export default function GradesClient() {
  const searchParams = useSearchParams();
  const initialSubject = Number(searchParams.get("subjectId")) || null;

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(initialSubject);
  const [semester, setSemester] = useState<Semester>("first");

  const [items, setItems] = useState<ScoreItem[]>([]);
  const [totalMax, setTotalMax] = useState(100);
  const [passingScore, setPassingScore] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{ rows: SummaryRow[]; stats: SummaryStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rowsRef = useRef<Row[]>([]);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  /* ---------------------------- تحميل الفصول ---------------------------- */
  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ classrooms: Classroom[] }>("/api/classrooms");
      if (res.ok && res.data) setClassrooms(res.data.classrooms ?? []);
      else if (res.error) pushToast("error", res.error);
    })();
  }, [pushToast]);

  /* ------------- استنتاج الفصل من المادة المحددة في الرابط ------------- */
  useEffect(() => {
    if (!initialSubject) return;
    (async () => {
      const res = await apiFetch<{ subject: { classroomId: number } }>(
        `/api/grades?subjectId=${initialSubject}`,
      );
      if (res.ok && res.data?.subject) setClassroomId(res.data.subject.classroomId);
    })();
  }, [initialSubject]);

  /* ---------------------------- مواد الفصل ---------------------------- */
  useEffect(() => {
    if (!classroomId) {
      setSubjects([]);
      return;
    }
    (async () => {
      const res = await apiFetch<{ subjects: Subject[] }>(`/api/subjects?classroomId=${classroomId}`);
      if (res.ok && res.data) {
        const list = res.data.subjects ?? [];
        setSubjects(list);
        setSubjectId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null));
      }
    })();
  }, [classroomId]);

  /* ------------------------- تحميل صفوف الرصد ------------------------- */
  const loadRows = useCallback(async () => {
    if (!subjectId) {
      setRows([]);
      setItems([]);
      setSummary(null);
      return;
    }
    setLoading(true);
    const res = await apiFetch<{
      semester: Semester;
      subject: {
        id: number;
        name: string;
        items: ScoreItem[];
        totalMax: number;
        passingScore: number;
        classroomId: number;
        grade: string;
        section: string;
      };
      rows: Row[];
    }>(`/api/grades?subjectId=${subjectId}&semester=${semester}`);
    if (res.ok && res.data) {
      setItems((res.data.subject.items ?? []).map((i) => ({ ...i, period: toPeriod(i.period) })));
      setTotalMax(res.data.subject.totalMax);
      setPassingScore(res.data.subject.passingScore);
      const loaded = res.data.rows ?? [];
      rowsRef.current = loaded;
      setRows(loaded);
      setClassroomId(res.data.subject.classroomId);
      if (res.data.semester) setSemester(res.data.semester);
    } else if (res.error) {
      pushToast("error", res.error);
      setRows([]);
    }
    setLoading(false);
  }, [subjectId, semester, pushToast]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  /* ------------------- ملخص الفصلين (المجموع والمتوسط) ------------------- */
  const loadSummary = useCallback(async () => {
    if (!subjectId) {
      setSummary(null);
      return;
    }
    const res = await apiFetch<{ rows: SummaryRow[]; stats: SummaryStats }>(
      `/api/grades/summary?subjectId=${subjectId}`,
    );
    if (res.ok && res.data) setSummary({ rows: res.data.rows ?? [], stats: res.data.stats });
    else setSummary(null);
  }, [subjectId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  /* ------------------------------ الحفظ التلقائي ------------------------------ */
  const persist = useCallback(
    async (studentId: number, values: GradeValues) => {
      setSaveState({ status: "saving" });
      const res = await apiFetch<{ total: number; savedAt: string; overflow: boolean }>("/api/grades", {
        method: "PUT",
        body: JSON.stringify({ studentId, subjectId, semester, values }),
      });
      if (res.ok && res.data) {
        setSaveState({ status: "saved", at: res.data.savedAt });
        if (res.data.overflow) pushToast("error", "تم تقريب الدرجات المتجاوزة للحد الأعلى");
      } else {
        setSaveState({ status: "error" });
        pushToast("error", res.error ?? "تعذر الحفظ");
      }
    },
    [subjectId, semester, pushToast],
  );

  const setValue = useCallback(
    (studentId: number, itemId: string, raw: string) => {
      const numeric = raw === "" ? null : Math.max(0, Math.min(Number(raw) || 0, 999));
      const current = rowsRef.current.find((r) => r.studentId === studentId);
      if (!current) return;

      const values = { ...current.values, [itemId]: numeric };
      const total = computeTotal(items, values);
      const next = { ...current, values, total };

      rowsRef.current = rowsRef.current.map((r) => (r.studentId === studentId ? next : r));
      setRows(rowsRef.current);

      const key = `s${studentId}`;
      if (pending.current[key]) clearTimeout(pending.current[key]);
      pending.current[key] = setTimeout(() => {
        delete pending.current[key];
        void persist(studentId, values);
      }, 550);
    },
    [items, persist],
  );

  /* ------------------------------ لوحة المفاتيح ------------------------------ */
  function handleKey(event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const cols = items.length;
    const go = (r: number, c: number) => {
      if (r < 0 || r >= visibleRows.length || c < 0 || c >= cols) return;
      const target = inputRefs.current[`${r}-${c}`];
      if (target) {
        event.preventDefault();
        target.focus();
        target.select();
      }
    };

    switch (event.key) {
      case "Enter":
        go(row + 1, col);
        break;
      case "ArrowDown":
        event.preventDefault();
        go(row + 1, col);
        break;
      case "ArrowUp":
        event.preventDefault();
        go(row - 1, col);
        break;
      case "ArrowLeft":
        event.preventDefault();
        go(row, col + 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        go(row, col - 1);
        break;
      default:
        break;
    }
  }

  /* ---------------------------- البحث والتصفية ---------------------------- */
  const visibleRows = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.includes(q) ||
        (r.nationalId ?? "").includes(q) ||
        String(r.classNumber ?? "").includes(q),
    );
  }, [rows, search]);

  const periodGroups = useMemo(() => {
    const p1 = items.filter((i) => toPeriod(i.period) === "p1");
    const p2 = items.filter((i) => toPeriod(i.period) === "p2");
    return [
      { period: "p1" as const, items: p1, max: p1.reduce((s, i) => s + i.max, 0) },
      { period: "p2" as const, items: p2, max: p2.reduce((s, i) => s + i.max, 0) },
    ].filter((g) => g.items.length > 0);
  }, [items]);

  const stats = useMemo(
    () => statsFor(visibleRows.map((r) => ({ total: r.total })), totalMax, passingScore),
    [visibleRows, totalMax, passingScore],
  );

  const summaryMap = useMemo(() => {
    const map = new Map<number, SummaryRow>();
    for (const row of summary?.rows ?? []) map.set(row.studentId, row);
    return map;
  }, [summary]);

  const overflowCount = useMemo(
    () =>
      rows.filter((row) =>
        items.some((item) => {
          const v = row.values[item.id];
          return typeof v === "number" && v > item.max;
        }),
      ).length,
    [rows, items],
  );

  const currentSubject = subjects.find((s) => s.id === subjectId);
  const currentClassroom = classrooms.find((c) => c.id === classroomId);
  const otherSemester: Semester = semester === "first" ? "second" : "first";

  const saveBadge = {
    idle: { text: "جاهز", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
    saving: { text: "جارٍ الحفظ...", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500 animate-pulse" },
    saved: { text: "محفوظ في السحابة", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    error: { text: "خطأ في الحفظ", cls: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  }[saveState.status];

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* الترويسة وأدوات التحكم */}
      <div className="animate-fade-up rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">رصد الدرجات</h1>
            <p className="mt-1 text-sm text-slate-500">
              تنقّل بالأسهم ↑↓←→ واضغط Enter للطالب التالي — الحفظ تلقائي لكل فصل دراسي
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${saveBadge.cls}`}
            >
              <span className={`h-2 w-2 rounded-full ${saveBadge.dot}`} />
              {saveBadge.text}
            </span>
            <Button
              variant="outline"
              onClick={() => window.open(`/print/class?subjectId=${subjectId}&semester=${semester}`, "_blank")}
              disabled={!subjectId}
            >
              🖨️ طباعة
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (subjectId) window.location.href = `/api/export?subjectId=${subjectId}`;
              }}
              disabled={!subjectId}
            >
              📊 تصدير نور
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={String(classroomId ?? "")}
            onChange={(e) => {
              setClassroomId(e.target.value ? Number(e.target.value) : null);
              setSubjectId(null);
            }}
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
            disabled={!classroomId}
          >
            <option value="">— اختر المادة —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (من {Number(s.total_max)})
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث فوري عن طالب..."
          />
        </div>

        {subjectId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <Badge tone="brand">
              {GRADE_LABEL_PREFIX} {currentClassroom?.grade} — {currentClassroom?.section}
            </Badge>
            <Badge tone="violet">{currentSubject?.name}</Badge>
            <Badge tone="sky">{SEMESTER_SHORT[semester]}</Badge>
            {periodGroups.map((g) => (
              <Badge key={g.period} tone={g.period === "p1" ? "sky" : "violet"}>
                {PERIOD_SHORT[g.period]}: {g.max}
              </Badge>
            ))}
            <Badge tone="emerald">النجاح {passingScore}</Badge>
          </div>
        )}
      </div>

      {/* ملخص الفصلين */}
      {subjectId && summary?.stats && (
        <div className="animate-fade-up rounded-2xl border border-slate-200/80 bg-gradient-to-l from-slate-900 to-slate-800 p-4 text-white shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-300">
              الملخص السنوي — مجموع الفصلين والمتوسط ({currentSubject?.name})
            </p>
            <span className="text-[10px] text-slate-400">
              {summary.stats.gradedFirst} مرصود في الفصل الأول · {summary.stats.gradedSecond} في الفصل الثاني
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: `متوسط ${SEMESTER_SHORT.first}`, value: summary.stats.avgFirst, tone: "bg-white/15" },
              { label: `متوسط ${SEMESTER_SHORT.second}`, value: summary.stats.avgSecond, tone: "bg-white/15" },
              { label: "مجموع الفصلين (المتوسط)", value: summary.stats.avgMean, tone: "bg-white" },
              {
                label: "المجموع السنوي",
                value: `${summary.stats.avgYear} / ${summary.stats.yearMax}`,
                tone: "bg-emerald-400 text-emerald-950",
              },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl px-3 py-2.5 text-center ${card.tone}`}>
                <p
                  className={`text-xl font-extrabold tabular-nums ${
                    card.tone === "bg-white" ? "text-brand-800" : ""
                  }`}
                >
                  {card.value}
                </p>
                <p
                  className={`mt-0.5 text-[10px] font-semibold ${
                    card.tone === "bg-white" ? "text-brand-600" : "text-slate-300"
                  }`}
                >
                  {card.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الإحصاءات */}
      {rows.length > 0 && (
        <div className="animate-fade-up grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "الطلاب", value: stats.count, tone: "text-slate-800" },
            { label: "الناجحون", value: stats.passed, tone: "text-emerald-600" },
            { label: "الراسبون", value: stats.failed, tone: "text-rose-600" },
            { label: `متوسط ${SEMESTER_SHORT[semester]}`, value: stats.avg, tone: "text-brand-700" },
            { label: "أعلى درجة", value: stats.highest, tone: "text-emerald-700" },
            { label: "أدنى درجة", value: stats.lowest, tone: "text-amber-600" },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2.5 text-center shadow-sm"
            >
              <p className={`text-lg font-extrabold tabular-nums ${card.tone}`}>{card.value}</p>
              <p className="text-[11px] font-semibold text-slate-500">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {overflowCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
          ⚠️ يوجد {overflowCount} طالب بدرجات تجاوزت الحد الأعلى — راجع الخلايا المميزة باللون الأحمر
        </div>
      )}

      {/* جدول الرصد */}
      {!classroomId ? (
        <Card>
          <EmptyState
            icon="🏫"
            title="اختر الفصل والمادة"
            description="حدد الفصل الدراسي ثم المادة لبدء رصد الدرجات."
          />
        </Card>
      ) : !subjectId ? (
        <Card>
          <EmptyState
            icon="📚"
            title="لا توجد مواد في هذا الفصل"
            description="أضف مادة دراسية مع توزيع الدرجات — ستكون مرتبطة بهذا الفصل فقط."
            action={
              <Link
                href="/dashboard/subjects"
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"
              >
                إضافة مادة
              </Link>
            }
          />
        </Card>
      ) : loading ? (
        <Card>
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner className="text-brand-600" /> جارٍ تحميل كشف {SEMESTER_SHORT[semester]}...
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="👨‍🎓"
            title="لا يوجد طلاب في هذا الفصل"
            description="أضف الطلاب أو استوردهم من كشوف نظام نور."
            action={
              <Link
                href="/dashboard/students"
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"
              >
                إدارة الطلاب
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-right text-sm">
              <thead className="bg-slate-100/90 text-[11px] text-slate-600">
                <tr>
                  <th rowSpan={2} className="border-b border-l border-slate-200 px-2 py-2 font-bold">
                    #
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 px-3 py-2 font-bold">
                    اسم الطالب
                  </th>
                  {periodGroups.map((group) => (
                    <th
                      key={group.period}
                      colSpan={group.items.length}
                      className={`border-b border-l border-slate-200 px-3 py-1.5 text-center font-bold ${
                        group.period === "p1"
                          ? "bg-sky-100/70 text-sky-800"
                          : "bg-violet-100/70 text-violet-800"
                      }`}
                    >
                      {group.period === "p1" ? "الفترة الأولى" : "الفترة الثانية"}
                      <span className="ms-1 font-normal">({group.max})</span>
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 font-bold"
                  >
                    مجموع {SEMESTER_SHORT[semester]}
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 font-bold">
                    %
                  </th>
                  <th
                    rowSpan={2}
                    className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 font-bold"
                    title={`مجموع ${SEMESTER_SHORT[otherSemester]}`}
                  >
                    {SEMESTER_SHORT[otherSemester]}
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 bg-brand-50 px-2 py-2 font-bold">
                    مجموع الفصلين
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 bg-brand-50 px-2 py-2 font-bold">
                    المتوسط
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 font-bold">
                    التقدير
                  </th>
                  <th rowSpan={2} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 font-bold">
                    الحالة
                  </th>
                </tr>
                <tr>
                  {periodGroups.flatMap((group) =>
                    group.items.map((item) => (
                      <th
                        key={item.id}
                        title={`${KIND_LABEL[item.kind]} — ${
                          item.group === "year" ? "أعمال السنة" : "الاختبار النهائي"
                        }`}
                        className="border-b border-l border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-bold"
                      >
                        <span className="block max-w-24 truncate text-[10px] leading-4">{item.label}</span>
                        <span className="text-[9px] font-normal text-slate-400">من {item.max}</span>
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row, rowIndex) => {
                  const pct = totalMax > 0 ? (row.total / totalMax) * 100 : 0;
                  const rating = ratingFor(pct, row.total, passingScore);
                  const s = summaryMap.get(row.studentId);
                  const otherTotal = semester === "first" ? (s?.second ?? 0) : (s?.first ?? 0);
                  const yearT = yearTotal(
                    semester === "first"
                      ? { first: row.total, second: otherTotal }
                      : { first: otherTotal, second: row.total },
                  );
                  const yearA = yearAverage(
                    semester === "first"
                      ? { first: row.total, second: otherTotal }
                      : { first: otherTotal, second: row.total },
                  );
                  const isOver = items.some((item) => {
                    const v = row.values[item.id];
                    return typeof v === "number" && v > item.max;
                  });
                  return (
                    <tr
                      key={row.studentId}
                      className={`transition ${
                        !rating.passed && row.total > 0 ? "bg-rose-50/50" : "hover:bg-brand-50/40"
                      } ${isOver ? "bg-amber-50/70" : ""}`}
                    >
                      <td className="px-2 py-1.5 text-center text-xs tabular-nums text-slate-400">
                        {row.classNumber ?? rowIndex + 1}
                      </td>
                      <td className="max-w-56 px-3 py-1.5">
                        <span className="block truncate text-[13px] font-semibold text-slate-800">
                          {row.fullName}
                        </span>
                      </td>
                      {periodGroups.flatMap((group) =>
                        group.items.map((item) => {
                          const globalIndex = items.indexOf(item);
                          const value = row.values[item.id];
                          const over = typeof value === "number" && value > item.max;
                          return (
                            <td key={item.id} className="sheet-cell px-1 py-1">
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${rowIndex}-${globalIndex}`] = el;
                                }}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.5"
                                value={value ?? ""}
                                onChange={(e) => setValue(row.studentId, item.id, e.target.value)}
                                onKeyDown={(e) => handleKey(e, rowIndex, globalIndex)}
                                onFocus={(e) => e.currentTarget.select()}
                                placeholder="—"
                                className={`h-9 w-16 rounded-lg border text-center text-sm font-bold tabular-nums outline-none transition focus:ring-2 ${
                                  over
                                    ? "border-rose-400 bg-rose-50 text-rose-700 focus:ring-rose-200"
                                    : typeof value === "number" && value >= item.max
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 focus:ring-emerald-200"
                                      : "border-slate-200 bg-white text-slate-800 focus:border-brand-400 focus:ring-brand-100"
                                }`}
                              />
                            </td>
                          );
                        }),
                      )}
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-block min-w-14 rounded-lg bg-slate-100 px-2 py-1 text-sm font-extrabold tabular-nums text-slate-800">
                          {row.total}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums text-slate-500">
                        {totalMax > 0 ? Math.round(pct) : 0}%
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums text-slate-400">
                        {otherTotal > 0 ? otherTotal : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-block min-w-14 rounded-lg bg-brand-50 px-2 py-1 text-sm font-extrabold tabular-nums text-brand-800 ring-1 ring-inset ring-brand-200">
                          {yearT > 0 ? yearT : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-block min-w-12 rounded-lg bg-slate-100 px-2 py-1 text-xs font-extrabold tabular-nums text-slate-700">
                          {yearA > 0 ? yearA : "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${gradeColorClasses(
                            rating.color,
                          )}`}
                        >
                          {rating.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {row.total === 0 ? (
                          <Badge tone="slate">لم يُرصد</Badge>
                        ) : rating.passed ? (
                          <Badge tone="emerald">ناجح</Badge>
                        ) : (
                          <Badge tone="rose">راسب</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 text-xs font-bold text-slate-600">
                <tr>
                  <td colSpan={2} className="border-t border-slate-200 px-3 py-2">
                    الملخص ({visibleRows.length} طالب)
                  </td>
                  {periodGroups.flatMap((group) =>
                    group.items.map((item) => {
                      const avg = visibleRows.length
                        ? round2(
                            visibleRows.reduce(
                              (s, r) =>
                                s + (typeof r.values[item.id] === "number" ? (r.values[item.id] as number) : 0),
                              0,
                            ) / visibleRows.length,
                          )
                        : 0;
                      return (
                        <td key={item.id} className="border-t border-slate-200 px-2 py-2 text-center tabular-nums">
                          {avg}
                        </td>
                      );
                    }),
                  )}
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums">{stats.avg}</td>
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums">{stats.pct}%</td>
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums">
                    {summary?.stats
                      ? semester === "first"
                        ? summary.stats.avgSecond || "—"
                        : summary.stats.avgFirst || "—"
                      : "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums text-brand-700">
                    {summary?.stats?.avgYear ?? "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums">
                    {summary?.stats?.avgMean ?? "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-center" colSpan={2}>
                    {stats.passed} ناجح / {stats.failed} راسب
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* مفتاح الألوان */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-[11px] text-slate-600">
          <span className="font-bold">مفتاح الألوان:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded border border-emerald-300 bg-emerald-50" /> درجة كاملة
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded border border-rose-400 bg-rose-50" /> تجاوز الحد الأعلى
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded bg-rose-100" /> طالب راسب
          </span>
          <span className="ms-auto">
            المادة: <b>{currentSubject?.name ?? "—"}</b> · الفصل:{" "}
            <b>
              {currentClassroom ? `${GRADE_LABEL_PREFIX} ${currentClassroom.grade} ${currentClassroom.section}` : "—"}
            </b>{" "}
            · {SEMESTER_LABEL[semester]} · المجموع <b>{totalMax}</b> · النجاح <b>{passingScore}</b>
          </span>
        </div>
      )}

      {/* إشعارات فردية */}
      {visibleRows.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
          <span className="py-1 text-[11px] font-bold text-slate-500">طباعة إشعار فردي:</span>
          {visibleRows.slice(0, 40).map((row) => (
            <button
              key={row.studentId}
              type="button"
              onClick={() =>
                window.open(
                  `/print/notices?subjectId=${subjectId}&semester=${semester}&studentId=${row.studentId}`,
                  "_blank",
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              title={`طباعة إشعار ${row.fullName}`}
            >
              🖨️ {row.fullName.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
      )}

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}

function ratingFor(pct: number, total: number, passing: number) {
  let label = "ضعيف";
  let color = "rose";
  if (pct >= 90) {
    label = "ممتاز";
    color = "emerald";
  } else if (pct >= 80) {
    label = "جيد جداً";
    color = "sky";
  } else if (pct >= 65) {
    label = "جيد";
    color = "amber";
  } else if (pct >= 50) {
    label = "مقبول";
    color = "orange";
  }
  return { label, color, passed: total >= passing };
}
