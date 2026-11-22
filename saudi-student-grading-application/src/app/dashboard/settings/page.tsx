"use client";

import { useCallback, useEffect, useState } from "react";
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
};

type Me = { uid: number; username: string; fullName: string; role: string };

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

  const pushToast = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ settings: Settings }>("/api/settings");
    if (res.ok && res.data?.settings) setSettings({ ...EMPTY, ...res.data.settings });
    else if (res.error) pushToast("error", res.error);
    setLoading(false);
  }, [pushToast]);

  const loadMe = useCallback(async () => {
    const res = await apiFetch<{ user: Me }>("/api/auth/me");
    if (res.ok && res.data?.user) {
      const user = res.data.user as unknown as Me;
      setMe(user);
      setAccName(user.fullName);
      setAccUsername(user.username);
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

  const field = (key: keyof Settings) => ({
    value: settings[key],
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
