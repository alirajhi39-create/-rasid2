"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Textarea,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import { GRADES_BY_STAGE, GRADE_LABEL_PREFIX, SECTIONS, STAGES, type Stage } from "@/lib/constants";

type Classroom = {
  id: number;
  grade: string;
  section: string;
  stage: string;
  students_count: number;
  subjects_count: number;
};

type Student = {
  id: number;
  full_name: string;
  national_id: string | null;
  classroom_id: number;
  class_number: number | null;
  guardian_phone: string | null;
  notes: string | null;
  active: boolean;
  grade: string;
  section: string;
  stage: string;
};

type ImportRow = { fullName: string; nationalId?: string; classNumber?: number | null };

export default function StudentsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeClass, setActiveClass] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // نماذج
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Classroom | null>(null);
  const [classForm, setClassForm] = useState({ grade: "السادس", section: "أ", stage: "ابتدائي" as Stage });

  const [studentModal, setStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState({
    fullName: "",
    nationalId: "",
    classNumber: "",
    guardianPhone: "",
    notes: "",
    classroomId: 0,
  });

  const [importModal, setImportModal] = useState(false);
  const [importTab, setImportTab] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importTarget, setImportTarget] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  /* ---------------------------- تحميل البيانات ---------------------------- */
  const loadClassrooms = useCallback(async () => {
    const res = await apiFetch<{ classrooms: Classroom[] }>("/api/classrooms");
    if (res.ok && res.data) setClassrooms(res.data.classrooms ?? []);
    else if (res.error) pushToast("error", res.error);
  }, [pushToast]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeClass !== "all") params.set("classroomId", String(activeClass));
    if (search.trim()) params.set("search", search.trim());
    const res = await apiFetch<{ students: Student[] }>(`/api/students?${params.toString()}`);
    if (res.ok && res.data) setStudents(res.data.students ?? []);
    else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [activeClass, search, pushToast]);

  useEffect(() => {
    void loadClassrooms();
  }, [loadClassrooms]);

  useEffect(() => {
    const timer = setTimeout(() => void loadStudents(), 250);
    return () => clearTimeout(timer);
  }, [loadStudents]);

  useEffect(() => {
    if (classrooms.length && !importTarget) setImportTarget(classrooms[0].id);
  }, [classrooms, importTarget]);

  /* ------------------------------- الفصول ------------------------------- */
  function openNewClass() {
    setEditingClass(null);
    setClassForm({ grade: "السادس", section: "أ", stage: "ابتدائي" });
    setClassModal(true);
  }

  function openEditClass(item: Classroom) {
    setEditingClass(item);
    setClassForm({ grade: item.grade, section: item.section, stage: item.stage as Stage });
    setClassModal(true);
  }

  async function saveClass() {
    const url = editingClass ? `/api/classrooms/${editingClass.id}` : "/api/classrooms";
    const res = await apiFetch(url, {
      method: editingClass ? "PUT" : "POST",
      body: JSON.stringify(classForm),
    });
    if (res.ok) {
      pushToast("success", editingClass ? "تم تحديث الفصل" : "تم إضافة الفصل");
      setClassModal(false);
      await loadClassrooms();
      await loadStudents();
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function deleteClass(item: Classroom) {
    if (
      !confirm(
        `سيتم حذف فصل ${GRADE_LABEL_PREFIX} ${item.grade} ${item.section} وكل الطلاب والمواد والدرجات المرتبطة به.\nهل أنت متأكد؟`,
      )
    )
      return;
    const res = await apiFetch(`/api/classrooms/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      pushToast("success", "تم حذف الفصل");
      if (activeClass === item.id) setActiveClass("all");
      await loadClassrooms();
      await loadStudents();
    } else pushToast("error", res.error ?? "خطأ");
  }

  /* ------------------------------ الطلاب ------------------------------ */
  function openNewStudent() {
    const target = activeClass === "all" ? (classrooms[0]?.id ?? 0) : activeClass;
    setEditingStudent(null);
    setStudentForm({
      fullName: "",
      nationalId: "",
      classNumber: "",
      guardianPhone: "",
      notes: "",
      classroomId: target,
    });
    setStudentModal(true);
  }

  function openEditStudent(student: Student) {
    setEditingStudent(student);
    setStudentForm({
      fullName: student.full_name,
      nationalId: student.national_id ?? "",
      classNumber: student.class_number ? String(student.class_number) : "",
      guardianPhone: student.guardian_phone ?? "",
      notes: student.notes ?? "",
      classroomId: student.classroom_id,
    });
    setStudentModal(true);
  }

  async function saveStudent() {
    const payload = {
      fullName: studentForm.fullName,
      nationalId: studentForm.nationalId,
      classNumber: studentForm.classNumber === "" ? null : Number(studentForm.classNumber),
      guardianPhone: studentForm.guardianPhone,
      notes: studentForm.notes,
      classroomId: Number(studentForm.classroomId),
    };
    if (!payload.classroomId) {
      pushToast("error", "أضف فصلاً دراسياً أولاً");
      return;
    }
    const res = await apiFetch(editingStudent ? `/api/students/${editingStudent.id}` : "/api/students", {
      method: editingStudent ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      pushToast("success", editingStudent ? "تم تحديث بيانات الطالب" : "تم إضافة الطالب");
      setStudentModal(false);
      await loadStudents();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function deleteStudent(student: Student) {
    if (!confirm(`حذف الطالب «${student.full_name}» وكل درجاته؟`)) return;
    const res = await apiFetch(`/api/students/${student.id}`, { method: "DELETE" });
    if (res.ok) {
      pushToast("success", "تم حذف الطالب");
      await loadStudents();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "خطأ");
  }

  /* ------------------------------ الاستيراد ------------------------------ */
  function parsePasted(text: string): ImportRow[] {
    const rows: ImportRow[] = [];
    for (const line of text.split(/\r?\n/)) {
      const clean = line.replace(/\t+/g, " | ").trim();
      if (!clean) continue;
      // تخطي أسطر العناوين
      if (/^(الرقم|م|#|اسم الطالب|اسم الطالبة|رقم الهوية|السجل المدني)/.test(clean) && !/\d{6,}/.test(clean))
        continue;

      const parts = clean.split(/\s*\|\s*|\s{2,}/).filter(Boolean);
      // الحالة ١: يوجد رقم هوية
      const idMatch = clean.match(/\b\d{8,12}\b/);
      const nationalId = idMatch ? idMatch[0] : undefined;

      let fullName = clean;
      let classNumber: number | null = null;

      if (parts.length >= 2) {
        // العثور على الجزء الذي يمثل الاسم (أكثر من كلمتين عادة)
        const namePart = parts.find((p) => p.split(/\s+/).length >= 2 && !/^\d+$/.test(p)) ?? parts[0];
        fullName = namePart;
        const numPart = parts.find((p) => /^\d+$/.test(p.trim()));
        if (numPart) classNumber = Number(numPart.trim());
      } else {
        fullName = clean.replace(/\b\d{8,12}\b/g, "").trim();
      }

      fullName = fullName
        .replace(/\b\d{1,3}\b/g, (m) => (m.length <= 3 && /^\d+$/.test(m) ? "" : m))
        .replace(/\s*\|\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (fullName && fullName.length >= 3) rows.push({ fullName, nationalId, classNumber });
    }
    return rows;
  }

  async function handleFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", codepage: 65001 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        pushToast("error", "الملف لا يحتوي على أوراق عمل");
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

      const keys = json.length ? Object.keys(json[0]).map((k) => k.trim()) : [];
      const findKey = (patterns: RegExp[]) =>
        keys.find((k) => patterns.some((p) => p.test(k)));

      const nameKey =
        findKey([/^اسم\s*الطالب/, /^اسم\s*الطالبة/, /^الاسم/, /^student/i, /^الاسم\s*الرباعي/]) ?? keys[0];
      const idKey = findKey([/^رقم\s*الهوية/, /^الهوية/, /^السجل\s*المدني/, /^رقم\s*السجل/, /^id/i]);
      const numKey = findKey([/^الرقم$/, /^م$/, /^رقم\s*الطالب/, /^رقم\s*القيد/, /^no$/i]);

      const rows: ImportRow[] = [];
      for (const row of json) {
        const name = String(row[nameKey] ?? "").replace(/\s+/g, " ").trim();
        if (!name || name.length < 3) continue;
        const idRaw = idKey ? String(row[idKey] ?? "").replace(/\D/g, "") : "";
        const numRaw = numKey ? String(row[numKey] ?? "").trim() : "";
        rows.push({
          fullName: name,
          nationalId: idRaw || undefined,
          classNumber: numRaw && /^\d+$/.test(numRaw) ? Number(numRaw) : null,
        });
      }
      setImportRows(rows);
      pushToast("info", `تم قراءة ${rows.length} سجل من الملف — راجع المعاينة قبل الحفظ`);
    } catch {
      pushToast("error", "تعذر قراءة الملف — تأكد أنه بصيغة xlsx أو csv");
    }
  }

  function preparePaste() {
    const rows = parsePasted(pasteText);
    setImportRows(rows);
    if (rows.length === 0) pushToast("error", "لم يتم التعرف على أسماء في النص الملصق");
    else pushToast("info", `تم التعرف على ${rows.length} اسم — راجع المعاينة`);
  }

  async function confirmImport() {
    if (!importTarget) {
      pushToast("error", "حدد الفصل المستهدف");
      return;
    }
    setImporting(true);
    const res = await apiFetch<{ inserted: number; skipped: number; message: string }>(
      "/api/students/import",
      { method: "POST", body: JSON.stringify({ classroomId: importTarget, rows: importRows }) },
    );
    setImporting(false);
    if (res.ok && res.data) {
      pushToast("success", res.data.message);
      setImportModal(false);
      setImportRows([]);
      setPasteText("");
      setActiveClass(importTarget);
      await loadStudents();
      await loadClassrooms();
    } else pushToast("error", res.error ?? "تعذر الاستيراد");
  }

  /* ------------------------------ مساعدات ------------------------------ */
  const grouped = useMemo(() => {
    const map = new Map<string, Classroom[]>();
    for (const c of classrooms) {
      const list = map.get(c.stage) ?? [];
      list.push(c);
      map.set(c.stage, list);
    }
    return [...map.entries()];
  }, [classrooms]);

  const totalStudents = classrooms.reduce((sum, c) => sum + c.students_count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* الترويسة */}
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">الطلاب والفصول</h1>
          <p className="mt-1 text-sm text-slate-500">
            إدارة الفصول الدراسية وإضافة الطلاب أو استيرادهم من كشوف نظام نور
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNewClass}>
            🏫 فصل دراسي
          </Button>
          <Button variant="outline" onClick={() => setImportModal(true)}>
            📥 استيراد
          </Button>
          <Button onClick={openNewStudent}>➕ إضافة طالب</Button>
        </div>
      </div>

      {/* الفصول */}
      <Card
        title="الفصول الدراسية"
        subtitle={`${classrooms.length} فصل · ${totalStudents} طالب`}
        action={
          <Button size="sm" variant="secondary" onClick={openNewClass}>
            + فصل جديد
          </Button>
        }
      >
        {classrooms.length === 0 ? (
          <EmptyState
            icon="🏫"
            title="لا توجد فصول دراسية"
            description="أضف فصلاً أولاً حتى تتمكن من إضافة الطلاب والمواد ورصد الدرجات."
            action={
              <Button size="sm" onClick={openNewClass}>
                إضافة فصل دراسي
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {grouped.map(([stage, list]) => (
              <div key={stage}>
                <p className="mb-2 text-xs font-bold text-slate-400">المرحلة {stage}</p>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveClass(activeClass === item.id ? "all" : item.id)}
                      className={`group rounded-2xl border p-3.5 text-right transition ${
                        activeClass === item.id
                          ? "border-brand-400 bg-brand-50/70 ring-2 ring-brand-100"
                          : "border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-extrabold text-slate-800">
                            {GRADE_LABEL_PREFIX} {item.grade}
                          </p>
                          <p className="text-[11px] text-slate-500">الشعبة {item.section}</p>
                        </div>
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-bold text-brand-700 ring-1 ring-slate-200">
                          {item.section}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5">
                        <Badge tone="emerald">👨‍🎓 {item.students_count}</Badge>
                        <Badge tone="violet">📚 {item.subjects_count}</Badge>
                      </div>
                      <div
                        className="mt-2.5 flex gap-1.5 opacity-0 transition group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => openEditClass(item)}
                          onKeyDown={(e) => e.key === "Enter" && openEditClass(item)}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                        >
                          تعديل
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => deleteClass(item)}
                          onKeyDown={(e) => e.key === "Enter" && deleteClass(item)}
                          className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100"
                        >
                          حذف
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* جدول الطلاب */}
      <Card
        title="قائمة الطلاب"
        subtitle={
          activeClass === "all"
            ? "جميع الفصول"
            : `الصف ${classrooms.find((c) => c.id === activeClass)?.grade ?? ""} — الشعبة ${
                classrooms.find((c) => c.id === activeClass)?.section ?? ""
              }`
        }
        action={
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ابحث بالاسم أو الهوية..."
              className="w-48 sm:w-64"
            />
            <Select
              value={String(activeClass)}
              onChange={(e) => setActiveClass(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-32"
            >
              <option value="all">كل الفصول</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade} / {c.section}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner className="text-brand-600" /> جارٍ التحميل...
          </div>
        ) : students.length === 0 ? (
          <EmptyState
            icon="👨‍🎓"
            title="لا يوجد طلاب"
            description="أضف الطلاب يدوياً أو استوردهم من ملف Excel أو من كشف نظام نور باللصق المباشر."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={openNewStudent}>
                  إضافة طالب
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportModal(true)}>
                  استيراد دفعة
                </Button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-bold">#</th>
                  <th className="px-3 py-2.5 font-bold">اسم الطالب</th>
                  <th className="px-3 py-2.5 font-bold">الهوية / السجل</th>
                  <th className="px-3 py-2.5 font-bold">الصف</th>
                  <th className="px-3 py-2.5 font-bold">الفصل</th>
                  <th className="px-3 py-2.5 font-bold">ملاحظات</th>
                  <th className="px-3 py-2.5 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student, index) => (
                  <tr key={student.id} className="transition hover:bg-brand-50/40">
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-400">
                      {student.class_number ?? index + 1}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{student.full_name}</td>
                    <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">
                      {student.national_id || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {GRADE_LABEL_PREFIX} {student.grade}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="brand">{student.section}</Badge>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-xs text-slate-400">
                      {student.notes || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEditStudent(student)}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteStudent(student)}>
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ============ نافذة الفصل ============ */}
      <Modal
        open={classModal}
        onClose={() => setClassModal(false)}
        title={editingClass ? "تعديل الفصل" : "إضافة فصل دراسي"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClassModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveClass}>{editingClass ? "حفظ التعديلات" : "إضافة الفصل"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="المرحلة" className="sm:col-span-1">
            <Select
              value={classForm.stage}
              onChange={(e) => {
                const stage = e.target.value as Stage;
                setClassForm((f) => ({
                  ...f,
                  stage,
                  grade: GRADES_BY_STAGE[stage]?.[0] ?? f.grade,
                }));
              }}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الصف" className="sm:col-span-1">
            <Select
              value={classForm.grade}
              onChange={(e) => setClassForm((f) => ({ ...f, grade: e.target.value }))}
            >
              {(GRADES_BY_STAGE[classForm.stage] ?? []).map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABEL_PREFIX} {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الشعبة / الفصل" className="sm:col-span-1">
            <Select
              value={classForm.section}
              onChange={(e) => setClassForm((f) => ({ ...f, section: e.target.value }))}
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Alert kind="info" className="mt-4">
          سيتم ترقيم الطلاب تلقائياً داخل الفصل عند إضافتهم.
        </Alert>
      </Modal>

      {/* ============ نافذة الطالب ============ */}
      <Modal
        open={studentModal}
        onClose={() => setStudentModal(false)}
        title={editingStudent ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStudentModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveStudent}>{editingStudent ? "حفظ التعديلات" : "إضافة الطالب"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="اسم الطالب (الرباعي)" hint="مثال: محمد عبدالله سعيد القحطاني">
            <Input
              value={studentForm.fullName}
              onChange={(e) => setStudentForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="الاسم الرباعي"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهوية / السجل المدني" hint="اختياري — من ٨ إلى ١٢ رقماً">
              <Input
                dir="ltr"
                className="text-right"
                value={studentForm.nationalId}
                onChange={(e) => setStudentForm((f) => ({ ...f, nationalId: e.target.value.replace(/\D/g, "") }))}
                placeholder="1XXXXXXXXX"
              />
            </Field>
            <Field label="الرقم في الفصل" hint="اتركه فارغاً للترقيم التلقائي">
              <Input
                type="number"
                value={studentForm.classNumber}
                onChange={(e) => setStudentForm((f) => ({ ...f, classNumber: e.target.value }))}
                placeholder="تلقائي"
              />
            </Field>
          </div>
          <Field
            label="رقم واتساب ولي الأمر"
            hint="بصيغة دولية بدون أصفار — لإرسال نتيجة الطالب عبر واتساب"
          >
            <Input
              dir="ltr"
              className="text-right"
              value={studentForm.guardianPhone}
              onChange={(e) =>
                setStudentForm((f) => ({ ...f, guardianPhone: e.target.value.replace(/[^\d+]/g, "") }))
              }
              placeholder="9665xxxxxxxx"
            />
          </Field>

          <Field label="الفصل" hint={editingStudent ? "يمكنك نقل الطالب لفصل آخر" : undefined}>
            <Select
              value={String(studentForm.classroomId)}
              onChange={(e) => setStudentForm((f) => ({ ...f, classroomId: Number(e.target.value) }))}
            >
              <option value={0}>— اختر الفصل —</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ملاحظات">
            <Textarea
              value={studentForm.notes}
              onChange={(e) => setStudentForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="أي ملاحظات إضافية عن الطالب..."
            />
          </Field>
        </div>
      </Modal>

      {/* ============ نافذة الاستيراد ============ */}
      <Modal
        open={importModal}
        onClose={() => setImportModal(false)}
        title="استيراد الطلاب"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportModal(false)}>
              إلغاء
            </Button>
            {importRows.length === 0 ? (
                <Button variant="secondary" onClick={preparePaste} disabled={importTab !== "paste" || !pasteText.trim()}>
                تحليل النص
              </Button>
            ) : (
              <Button onClick={confirmImport} disabled={importing}>
                {importing ? (
                  <>
                    <Spinner /> جارٍ الاستيراد...
                  </>
                ) : (
                  `حفظ ${importRows.length} طالب`
                )}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <Field label="الفصل المستهدف">
            <Select value={String(importTarget)} onChange={(e) => setImportTarget(Number(e.target.value))}>
              <option value={0}>— اختر الفصل —</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {GRADE_LABEL_PREFIX} {c.grade} — {c.section} ({c.stage})
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1">
            {[
              { id: "paste" as const, label: "📋 لصق من كشف نور" },
              { id: "file" as const, label: "📄 ملف Excel / CSV" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setImportTab(tab.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  importTab === tab.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {importTab === "paste" ? (
            <Field
              label="الصق أسماء الطلاب"
              hint="كل سطر يمثل طالباً. يدعم: الرقم، رقم الهوية، الاسم — من أي كشف."
            >
              <Textarea
                dir="auto"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"1 | 1098765432 | محمد عبدالله سعيد القحطاني\n2 | 1098765433 | خالد إبراهيم علي العتيبي"}
                className="min-h-44 font-mono text-xs"
              />
            </Field>
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
              >
                <span className="text-3xl">📄</span>
                <span className="text-sm font-bold text-slate-700">اختر ملف Excel أو CSV</span>
                <span className="text-[11px] text-slate-500">
                  يدعم .xlsx و .xls و .csv — يتم التعرف على أعمدة الاسم ورقم الهوية تلقائياً
                </span>
              </button>
            </div>
          )}

          {importRows.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold text-slate-600">
                معاينة — {importRows.length} سجل جاهز للحفظ
              </p>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2.5 py-2">#</th>
                      <th className="px-2.5 py-2">الاسم</th>
                      <th className="px-2.5 py-2">الهوية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importRows.slice(0, 200).map((row, i) => (
                      <tr key={`${row.fullName}-${i}`}>
                        <td className="px-2.5 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-slate-700">{row.fullName}</td>
                        <td dir="ltr" className="px-2.5 py-1.5 text-right font-mono text-slate-500">
                          {row.nationalId || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
