"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Toasts,
  type ToastItem,
} from "@/components/ui";
import { SEMESTERS } from "@/lib/constants";

type Settings = {
  schoolName: string;
  administration: string;
  ministryOffice: string;
  teacherName: string;
  academicYear: string;
  semester: string;
  headmasterName: string;
  pctExcellent: number;
  pctVgood: number;
  pctGood: number;
  pctPass: number;
  teacherSignature: string | null;
  headmasterSignature: string | null;
};

type Me = { uid: number; username: string; fullName: string; role: string; email?: string | null };

type Teacher = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  created_at: string;
  classrooms_count: number;
  students_count: number;
};

const EMPTY: Settings = {
  schoolName: "",
  administration: "",
  ministryOffice: "وزارة التعليم",
  teacherName: "",
  academicYear: "1447 هـ",
  semester: "الفصل الدراسي الأول",
  headmasterName: "",
  pctExcellent: 90,
  pctVgood: 80,
  pctGood: 65,
  pctPass: 50,
  teacherSignature: null,
  headmasterSignature: null,
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // بيانات الحساب
  const [accName, setAccName] = useState("");
  const [accUsername, setAccUsername] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  // المعلمون (للمدير)
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ fullName: "", username: "", password: "" });
  const [adding, setAdding] = useState(false);

  const [dbInfo, setDbInfo] = useState<{ tables: string[]; provider: string; userCount: number } | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ settings: Settings; emailConfigured?: boolean }>(
      "/api/settings",
    );
    if (res.ok && res.data?.settings) {
      setSettings({ ...EMPTY, ...res.data.settings });
      if (typeof res.data.emailConfigured === "boolean")
        setEmailConfigured(res.data.emailConfigured);
    } else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [pushToast]);

  const loadMe = useCallback(async () => {
    const res = await apiFetch<{ user: Me }>("/api/auth/me");
    if (res.ok && res.data?.user) {
      const user = res.data.user as unknown as Me;
      setMe(user);
      setAccName(user.fullName);
      setAccUsername(user.username);
      setAccEmail(user.email ?? "");
    }
  }, []);

  const loadTeachers = useCallback(async () => {
    setTeachersLoading(true);
    const res = await apiFetch<{ teachers: Teacher[] }>("/api/teachers");
    if (res.ok && res.data) setTeachers(res.data.teachers ?? []);
    setTeachersLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void loadMe();
    void (async () => {
      const res = await apiFetch<{ tables: string[]; provider: string; userCount: number }>("/api/init-db");
      if (res.ok && res.data) setDbInfo(res.data);
    })();
  }, [load, loadMe]);

  useEffect(() => {
    if (me?.role === "admin") void loadTeachers();
  }, [me?.role, loadTeachers]);

  async function save() {
    setSaving(true);
    const res = await apiFetch<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      pushToast("success", "تم حفظ بيانات المدرسة بنجاح");
      if (res.data?.settings) setSettings({ ...EMPTY, ...res.data.settings });
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function saveAccount() {
    if (newPassword && newPassword !== confirmPassword) {
      pushToast("error", "كلمتا المرور غير متطابقتين");
      return;
    }
    setChanging(true);
    const res = await apiFetch("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify({
        fullName: accName,
        username: accUsername,
        email: accEmail,
        currentPassword,
        newPassword,
      }),
    });
    setChanging(false);
    if (res.ok) {
      pushToast("success", newPassword ? "تم تحديث بيانات الحساب وكلمة المرور" : "تم تحديث بيانات الحساب");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await loadMe();
      router.refresh();
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function addTeacher() {
    if (newTeacher.password.length < 6) {
      pushToast("error", "كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    setAdding(true);
    const res = await apiFetch("/api/teachers", {
      method: "POST",
      body: JSON.stringify(newTeacher),
    });
    setAdding(false);
    if (res.ok) {
      pushToast("success", "تم إضافة المعلم بنجاح");
      setAddModal(false);
      setNewTeacher({ fullName: "", username: "", password: "" });
      await loadTeachers();
    } else pushToast("error", res.error ?? "خطأ");
  }

  async function deleteTeacher(teacher: Teacher) {
    if (
      !confirm(
        `سيتم حذف حساب «${teacher.full_name}» وكل فصوله وطلابه ومواده ودرجاته.\nهل أنت متأكد؟`,
      )
    )
      return;
    const res = await apiFetch(`/api/teachers?id=${teacher.id}`, { method: "DELETE" });
    if (res.ok) {
      pushToast("success", "تم حذف الحساب");
      await loadTeachers();
    } else pushToast("error", res.error ?? "خطأ");
  }

  /* ---------------------- النسخ الاحتياطي ---------------------- */
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadBackup = () => {
    setBackupBusy("export");
    window.location.href = "/api/backup";
    setTimeout(() => setBackupBusy(null), 2500);
  };

  const restoreBackup = async (file: File) => {
    if (
      !confirm(
        "سيتم استبدال جميع بياناتك الحالية (الفصول والطلاب والمواد والدرجات) بمحتوى الملف.\nهل أنت متأكد من المتابعة؟",
      )
    ) {
      return;
    }
    setBackupBusy("import");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch<{ message: string }>("/api/backup", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (res.ok && res.data) {
        pushToast("success", res.data.message ?? "تمت الاستعادة بنجاح");
      } else {
        pushToast("error", res.error ?? "تعذر الاستعادة");
      }
    } catch {
      pushToast("error", "ملف غير صالح — تأكد أنه ملف نسخة احتياطية JSON");
    } finally {
      setBackupBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ---------------------- توقيعات مرفوعة كصور ---------------------- */
  const sigRef = useRef<HTMLInputElement>(null);
  const [sigTarget, setSigTarget] = useState<"teacherSignature" | "headmasterSignature">(
    "teacherSignature",
  );

  /** تصغير الصورة في المتصفح قبل الرفع (لتقليل حجم القاعدة) */
  const readAndResize = (file: File, maxWidth = 600): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("قراءة الملف"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("صورة غير صالحة"));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("تعذر معالجة الصورة"));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png", 0.9));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

  const uploadSignature = async (file: File) => {
    try {
      const dataUrl = await readAndResize(file, 600);
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ [sigTarget]: dataUrl }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, [sigTarget]: dataUrl }));
        pushToast("success", "تم حفظ التوقيع");
      } else pushToast("error", res.error ?? "تعذر حفظ التوقيع");
    } catch {
      pushToast("error", "تعذر قراءة الصورة");
    } finally {
      if (sigRef.current) sigRef.current.value = "";
    }
  };

  const clearSignature = async (key: "teacherSignature" | "headmasterSignature") => {
    const res = await apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ [key]: "" }),
    });
    if (res.ok) {
      setSettings((prev) => ({ ...prev, [key]: null }));
      pushToast("success", "تم مسح التوقيع");
    } else pushToast("error", res.error ?? "تعذر المسح");
  };

  const field = <K extends keyof Settings>(key: K) => ({
    value: settings[key] as Exclude<Settings[K], null>,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setSettings((prev) => ({ ...prev, [key]: e.target.value })),
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-16 text-sm text-slate-500">
          <Spinner className="text-brand-600" /> جارٍ تحميل الإعدادات...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">الإعدادات</h1>
        <p className="mt-1 text-sm text-slate-500">
          بيانات الحساب الشخصي، وبيانات المدرسة للترويسة الرسمية، وإدارة حسابات المعلمين
        </p>
      </div>

      {/* بيانات المدرسة */}
      <Card
        title="بيانات المدرسة والترويسة"
        subtitle="مشتركة بين جميع المعلمين — تظهر في كل الكشوف والإشعارات المطبوعة"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المدرسة" className="sm:col-span-2">
            <Input {...field("schoolName")} placeholder="مثال: مدرسة الملك فهد الابتدائية" />
          </Field>
          <Field label="وزارة / الجهة">
            <Input {...field("ministryOffice")} placeholder="وزارة التعليم" />
          </Field>
          <Field
            label="إدارة التعليم / المنطقة"
            hint="اختياري — اتركه فارغاً لإخفائه من ترويسة التقارير"
          >
            <Input {...field("administration")} placeholder="اتركه فارغاً للإخفاء" />
          </Field>
          <Field label="العام الدراسي" hint="يظهر في ترويسة التقارير هكذا: العام الدراسي ١٤٤٨هـ">
            <Input {...field("academicYear")} placeholder="1448هـ" />
          </Field>
          <Field label="الفصل الدراسي الحالي" hint="فصلان دراسيان فقط — يُستخدم كافتراضي عند فتح كشف الرصد">
            <Select {...field("semester")}>
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.label}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="اسم مدير المدرسة" className="sm:col-span-2">
            <Input
              {...field("headmasterName")}
              placeholder="الاسم الثلاثي لمدير المدرسة — يظهر في خانة التوقيع"
            />
          </Field>
        </div>

        <Alert kind="info" className="mt-4">
          خانة «اسم المعلم» في الترويسة تُؤخذ تلقائياً من <b>حساب كل معلم</b> الذي يرصد الدرجات،
          أما اسم المدرسة والإدارة ومدير المدرسة فهي بيانات مشتركة.
        </Alert>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="اسم المعلم الافتراضي للترويسة" hint="يُستخدم فقط إن لم يتوفر اسم الحساب">
            <Input {...field("teacherName")} placeholder="الاسم الثلاثي للمعلم" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <>
                <Spinner /> جارٍ الحفظ...
              </>
            ) : (
              "💾 حفظ بيانات المدرسة"
            )}
          </Button>
        </div>
      </Card>

      {/* نِسب التقديرات */}
      <Card
        title="نِسب التقديرات"
        subtitle="الحدود المئوية للممتاز والجيد جداً والجيد والمقبول — تُطبَّق فوراً على الرصد والتقارير"
        action={<Badge tone="violet">قابلة للتعديل</Badge>}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { key: "pctExcellent" as const, label: "ممتاز %", hint: "منها فما فوق" },
            { key: "pctVgood" as const, label: "جيد جداً %", hint: "منها فما فوق" },
            { key: "pctGood" as const, label: "جيد %", hint: "منها فما فوق" },
            { key: "pctPass" as const, label: "مقبول %", hint: "أدنى درجة نجاح" },
          ].map((item) => (
            <Field key={item.key} label={item.label} hint={item.hint}>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings[item.key]}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, [item.key]: Number(e.target.value) }))
                }
              />
            </Field>
          ))}
        </div>

        {/* شريط معاينة حيّ */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="flex h-9 text-[11px] font-extrabold text-white">
            {[
              { label: "ضعيف", color: "bg-rose-500", from: 0, to: settings.pctPass },
              { label: "مقبول", color: "bg-orange-500", from: settings.pctPass, to: settings.pctGood },
              { label: "جيد", color: "bg-amber-500", from: settings.pctGood, to: settings.pctVgood },
              { label: "جيد جداً", color: "bg-sky-500", from: settings.pctVgood, to: settings.pctExcellent },
              { label: "ممتاز", color: "bg-emerald-500", from: settings.pctExcellent, to: 100 },
            ].map((band) => {
              const width = Math.max(0, band.to - band.from);
              return (
                <div
                  key={band.label}
                  className={`grid place-items-center overflow-hidden whitespace-nowrap px-1 transition-all ${band.color}`}
                  style={{ width: `${width}%` }}
                  title={`${band.label}: ${band.from}٪ — ${band.to}٪`}
                >
                  {width >= 9 ? band.label : ""}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <span>
              ضعيف: أقل من <b>{settings.pctPass}٪</b>
            </span>
            <span>
              مقبول: <b>{settings.pctPass}٪</b>
            </span>
            <span>
              جيد: <b>{settings.pctGood}٪</b>
            </span>
            <span>
              جيد جداً: <b>{settings.pctVgood}٪</b>
            </span>
            <span>
              ممتاز: <b>{settings.pctExcellent}٪</b> فأعلى
            </span>
          </div>
        </div>

        <Alert kind="info" className="mt-4">
          تُحفظ النِّسب مع «حفظ الإعدادات» وتُطبَّق فوراً على كشوف الرصد والإشعارات والملخص السنوي
          وملف التصدير لنظام نور.
        </Alert>
      </Card>

      {/* حالة إرسال البريد */}
      <div
        className={`rounded-2xl border p-4 text-sm leading-6 ${
          emailConfigured === false
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : emailConfigured === true
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        <p className="font-extrabold">
          {emailConfigured === false
            ? "⚠️ إرسال البريد الإلكتروني غير مُفعّل"
            : emailConfigured === true
              ? "✅ إرسال البريد الإلكتروني مُفعّل"
              : "… جارٍ فحص إعدادات البريد"}
        </p>
        {emailConfigured === false && (
          <p className="mt-1 text-[12px]">
            لإرسال روابط استعادة كلمة المرور فعلياً، أضف متغير البيئة{" "}
            <code dir="ltr" className="rounded bg-white px-1 font-mono text-[11px] font-bold">
              RESEND_API_KEY
            </code>{" "}
            من لوحة Vercel (Resend — الخطة المجانية تكفي). بدونه لن تُرسل أي رسالة، لكن يبقى التطبيق
            يعمل بالكامل.
          </p>
        )}
        {emailConfigured === true && (
          <p className="mt-1 text-[12px]">
            يُرسل رابط الاستعادة إلى البريد المسجل لكل حساب خلال ٣٠ دقيقة من صلاحيته.
          </p>
        )}
      </div>

      {/* بيانات الحساب */}
      <Card
        title="حسابي الشخصي"
        subtitle="اسمك واسم المستخدم وكلمة المرور الخاصة بك"
        action={
          me?.role === "admin" ? <Badge tone="amber">مدير النظام</Badge> : <Badge tone="brand">معلم</Badge>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المعلم (الاسم الكامل)" hint="يظهر في الكشوف الرسمية والترويسة">
            <Input value={accName} onChange={(e) => setAccName(e.target.value)} />
          </Field>
          <Field label="البريد الإلكتروني" hint="لرسائل استعادة كلمة المرور">
            <Input
              type="email"
              dir="ltr"
              className="text-right"
              value={accEmail}
              onChange={(e) => setAccEmail(e.target.value)}
              placeholder="teacher@school.edu.sa"
            />
          </Field>

          <Field label="اسم المستخدم" hint="بالإنجليزية — يستخدم للدخول">
            <Input
              dir="ltr"
              className="text-right"
              value={accUsername}
              onChange={(e) => setAccUsername(e.target.value.replace(/\s/g, ""))}
            />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
          <p className="mb-3 text-xs font-bold text-slate-700">تغيير كلمة المرور</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="كلمة المرور الحالية">
              <Input
                type="password"
                dir="ltr"
                className="text-right"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Field>
            <Field label="كلمة المرور الجديدة" hint="٦ أحرف على الأقل">
              <Input
                type="password"
                dir="ltr"
                className="text-right"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <Input
                type="password"
                dir="ltr"
                className="text-right"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="success"
            onClick={saveAccount}
            disabled={changing || (!accName.trim() && !newPassword)}
          >
            {changing ? (
              <>
                <Spinner /> جارٍ التحديث...
              </>
            ) : (
              "🔒 حفظ بيانات الحساب"
            )}
          </Button>
        </div>
      </Card>

      {/* إدارة المعلمين — للمدير فقط */}
      {me?.role === "admin" && (
        <Card
          title="حسابات المعلمين"
          subtitle="كل معلم يرى فصوله وطلابه ودرجاته فقط"
          action={
            <Button size="sm" onClick={() => setAddModal(true)}>
              + إضافة معلم
            </Button>
          }
        >
          {teachersLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Spinner className="text-brand-600" /> جارٍ التحميل...
            </div>
          ) : teachers.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">لا توجد حسابات بعد</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[560px] text-right text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">اسم المعلم</th>
                    <th className="px-3 py-2.5 font-bold">اسم المستخدم</th>
                    <th className="px-3 py-2.5 font-bold">الصلاحية</th>
                    <th className="px-3 py-2.5 font-bold">الفصول</th>
                    <th className="px-3 py-2.5 font-bold">الطلاب</th>
                    <th className="px-3 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-brand-50/40">
                      <td className="px-3 py-2.5 font-semibold text-slate-800">
                        {teacher.full_name}
                        {teacher.id === me.uid && (
                          <span className="ms-1.5 text-[10px] font-bold text-brand-600">(أنت)</span>
                        )}
                      </td>
                      <td dir="ltr" className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">
                        {teacher.username}
                      </td>
                      <td className="px-3 py-2.5">
                        {teacher.role === "admin" ? (
                          <Badge tone="amber">مدير النظام</Badge>
                        ) : (
                          <Badge tone="brand">معلم</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">{teacher.classrooms_count}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">{teacher.students_count}</td>
                      <td className="px-3 py-2.5">
                        {teacher.id === me.uid || teacher.role === "admin" ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => deleteTeacher(teacher)}>
                            حذف
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Alert kind="warn" className="mt-4">
            حذف حساب معلم يؤدي إلى حذف كل فصوله وطلابه ومواده ودرجاته نهائياً.
          </Alert>
        </Card>
      )}

      {/* التوقيعات */}
      <Card
        title="توقيعات الصور"
        subtitle="ارفع توقيع المعلم ومدير المدرسة ليظهر في نموذج التوقيع بالكشوف والإشعارات"
        action={<Badge tone="brand">صور PNG / JPG</Badge>}
      >
        <input
          ref={sigRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadSignature(file);
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: "teacherSignature" as const,
              label: "توقيع المعلم",
              hint: "يظهر أعلى اسم معلم المادة",
            },
            {
              key: "headmasterSignature" as const,
              label: "توقيع مدير المدرسة",
              hint: "يظهر أعلى اسم مدير المدرسة",
            },
          ].map((item) => {
            const value = settings[item.key];
            return (
              <div
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-right"
              >
                <p className="text-xs font-extrabold text-slate-700">{item.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{item.hint}</p>
                <div className="mt-2 grid h-20 place-items-center rounded-xl border border-dashed border-slate-300 bg-white">
                  {value ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={value} alt={item.label} className="max-h-16 object-contain" />
                  ) : (
                    <span className="text-[11px] text-slate-400">لا يوجد توقيع مرفوع</span>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSigTarget(item.key);
                      sigRef.current?.click();
                    }}
                    className="flex-1 rounded-lg bg-brand-600 px-2 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-700"
                  >
                    {value ? "استبدال" : "رفع صورة"}
                  </button>
                  {value && (
                    <button
                      type="button"
                      onClick={() => void clearSignature(item.key)}
                      className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-100"
                    >
                      مسح
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Alert kind="info" className="mt-4">
          تُصغَّر الصورة تلقائياً إلى ٦٠٠ بكسل عرضاً قبل الحفظ. فعّل «رسومات الخلفية» عند الطباعة
          لظهور التوقيع.
        </Alert>
      </Card>

      {/* النسخ الاحتياطي */}
      <Card
        title="النسخ الاحتياطي"
        subtitle="تنزيل أسماء الطلاب ودرجاتهم كملف واحد، واستعادتها لاحقاً"
        action={<Badge tone="emerald">JSON قابل للاستعادة</Badge>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={downloadBackup}
            disabled={backupBusy === "export"}
            className="group rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
          >
            <p className="text-lg">⬇️</p>
            <p className="mt-1 text-sm font-extrabold text-emerald-800">
              {backupBusy === "export" ? "جارٍ التحضير..." : "تنزيل نسخة احتياطية"}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-emerald-700">
              ملف JSON يضم الفصول والطلاب (بأرقام السجل المدني) والمواد وجميع الدرجات للفصلين
              الدراسيين.
            </p>
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={backupBusy === "import"}
            className="group rounded-2xl border border-sky-200 bg-sky-50 p-4 text-right transition hover:border-sky-300 hover:bg-sky-100 disabled:opacity-60"
          >
            <p className="text-lg">⬆️</p>
            <p className="mt-1 text-sm font-extrabold text-sky-800">
              {backupBusy === "import" ? "جارٍ الاستعادة..." : "استعادة نسخة احتياطية"}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-sky-700">
              يستبدل بياناتك الحالية بمحتوى الملف — يُفضّل تنزيل نسخة قبل الاستعادة.
            </p>
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restoreBackup(file);
          }}
        />

        <Alert kind="warn" className="mt-4">
          النسخة الاحتياطية تخص حسابك وبياناتك أنت فقط — لا تُعدّ مفتاحاً للاستعادة على حساب آخر
          بدل ترحيل الفصول يدوياً.
        </Alert>
      </Card>

      {/* حالة قاعدة البيانات */}
      <Card title="حالة قاعدة البيانات" subtitle="الاتصال التلقائي مع Neon PostgreSQL / Vercel">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dbInfo ? "emerald" : "slate"}>{dbInfo ? "متصلة" : "جارٍ الفحص..."}</Badge>
            {dbInfo && <Badge tone="brand">{dbInfo.provider}</Badge>}
            <Badge tone="sky">{dbInfo?.tables.length ?? 0} جدول</Badge>
            <Badge tone="violet">{dbInfo?.userCount ?? 0} حساب معلم</Badge>
          </div>

          {dbInfo && (
            <div className="flex flex-wrap gap-1.5">
              {dbInfo.tables.map((table) => (
                <span
                  key={table}
                  dir="ltr"
                  className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-600"
                >
                  {table}
                </span>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-slate-50 p-3.5 text-[11px] leading-6 text-slate-600">
            <p className="font-bold text-slate-700">خطوات النشر على Vercel + Neon:</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pe-4">
              <li>ارفع المشروع إلى مستودع GitHub.</li>
              <li>
                في Vercel: <b>Add New → Project</b> ثم اختر المستودع.
              </li>
              <li>
                من تبويب <b>Storage</b> اختر <b>Neon Postgres</b> من المتجر واضغط Connect — سيُنشأ متغير{" "}
                <code dir="ltr" className="rounded bg-white px-1 font-mono">
                  DATABASE_URL
                </code>{" "}
                تلقائياً.
              </li>
              <li>
                أضف متغير{" "}
                <code dir="ltr" className="rounded bg-white px-1 font-mono">
                  AUTH_SECRET
                </code>{" "}
                بقيمة عشوائية طويلة.
              </li>
              <li>اضغط Deploy — ثم أنشئ حسابك من صفحة الدخول كأول معلم (مدير النظام).</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* نافذة إضافة معلم */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="إضافة حساب معلم"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddModal(false)}>
              إلغاء
            </Button>
            <Button onClick={addTeacher} disabled={adding}>
              {adding ? (
                <>
                  <Spinner /> جارٍ الإضافة...
                </>
              ) : (
                "إضافة المعلم"
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="اسم المعلم (الاسم الكامل)">
            <Input
              value={newTeacher.fullName}
              onChange={(e) => setNewTeacher((t) => ({ ...t, fullName: e.target.value }))}
              placeholder="مثال: سعد علي عبدالله الزهراني"
            />
          </Field>
          <Field label="اسم المستخدم" hint="بالإنجليزية من ٣ إلى ٢٤ حرفاً">
            <Input
              dir="ltr"
              className="text-right"
              value={newTeacher.username}
              onChange={(e) => setNewTeacher((t) => ({ ...t, username: e.target.value.replace(/\s/g, "") }))}
              placeholder="teacher.saad"
            />
          </Field>
          <Field label="كلمة المرور" hint="٦ أحرف على الأقل — يفضّل أن يغيّرها المعلم لاحقاً">
            <Input
              type="password"
              dir="ltr"
              className="text-right"
              value={newTeacher.password}
              onChange={(e) => setNewTeacher((t) => ({ ...t, password: e.target.value }))}
              placeholder="••••••••"
            />
          </Field>
        </div>
      </Modal>

      <Toasts items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
