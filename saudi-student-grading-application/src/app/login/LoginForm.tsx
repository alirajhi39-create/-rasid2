"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Field, Alert, Spinner } from "@/components/ui";

type Mode = "login" | "register";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("login");

  // تسجيل الدخول
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // إنشاء حساب معلم جديد
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regSchool, setRegSchool] = useState("");
  const [regAdmin, setRegAdmin] = useState("");
  const [regHeadmaster, setRegHeadmaster] = useState("");
  const [showSchoolFields, setShowSchoolFields] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [noAccounts, setNoAccounts] = useState(false);

  // تهيئة قاعدة البيانات تلقائياً عند أول زيارة (بدون عرض أي بيانات دخول)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/init-db", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.needsFirstAccount) {
          setNoAccounts(true);
          setMode("register");
        }
      } catch {
        if (!cancelled) setError("تعذر الاتصال بقاعدة البيانات، تحقق من متغير DATABASE_URL");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "تعذر تسجيل الدخول");
        return;
      }
      router.replace(nextUrl);
      router.refresh();
    } catch {
      setError("حدث خطأ في الشبكة، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (regPassword !== regConfirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: regName,
          username: regUsername,
          password: regPassword,
          schoolName: showSchoolFields ? regSchool : "",
          administration: showSchoolFields ? regAdmin : "",
          headmasterName: showSchoolFields ? regHeadmaster : "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // نعرض السبب التفصيلي إن وُجد لتسهيل تشخيص المشكلة
        const detail = data.details ? ` (${String(data.details).slice(0, 160)})` : "";
        setError((data.error ?? "تعذر إنشاء الحساب") + detail);
        return;
      }
      setNotice(data.message ?? "تم إنشاء الحساب");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("حدث خطأ في الشبكة، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 right-1/2 h-96 w-96 translate-x-1/2 rounded-full bg-brand-300/40 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-2xl shadow-slate-300/40 backdrop-blur-xl lg:grid-cols-2">
        {/* اللوحة التعريفية */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-9 text-white lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl ring-1 ring-white/25">
                🎓
              </div>
              <div>
                <p className="text-xl font-extrabold tracking-tight">رَصْد</p>
                <p className="text-xs text-brand-100">نظام إدارة ورصد درجات الطلاب</p>
              </div>
            </div>

            <h1 className="mt-10 text-3xl font-extrabold leading-snug">
              لكل معلم حسابه الخاص
              <br />
              <span className="text-brand-200">ورصد مستقل بخصوصية كاملة</span>
            </h1>

            <ul className="mt-8 space-y-3 text-sm text-brand-50">
              {[
                "أنشئ حسابك باسمك وكلمة مرور خاصة بك",
                "فصولك وطلابك ودرجاتك معزولة عن غيرك",
                "بيانات المدرسة ومديرها مشتركة للجميع",
                "توزيع مرن للدرجات (أعمال السنة + النهائي)",
                "حفظ تلقائي فوري في السحابة أثناء الرصد",
                "تقارير PDF رسمية وتصدير Excel لنظام نور",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px]">
                    ✓
                  </span>
                  <span className="leading-6">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] leading-6 text-brand-200">
            المملكة العربية السعودية — وزارة التعليم
            <br />
            جاهز للنشر على Vercel والربط التلقائي مع Neon PostgreSQL
          </p>
        </div>

        {/* النماذج */}
        <div className="p-7 sm:p-10">
          <div className="mb-6 text-center lg:text-right">
            <div className="mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-3xl ring-1 ring-brand-100 lg:hidden">
              🎓
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">
              {mode === "login" ? "تسجيل دخول المعلم" : "إنشاء حساب معلم"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === "login"
                ? "ادخل بيانات حسابك للوصول إلى لوحة رصد الدرجات"
                : "أدخل بياناتك وأنشئ كلمة مرور خاصة بك"}
            </p>
          </div>

          {checking && (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              <Spinner className="text-brand-600" /> جارٍ تهيئة قاعدة البيانات...
            </div>
          )}

          {noAccounts && mode === "register" && (
            <Alert kind="info" className="mb-4">
              لا توجد حسابات بعد — أول حساب يُنشأ سيحصل على صلاحية <b>مدير النظام</b>.
            </Alert>
          )}
          {notice && (
            <Alert kind="success" className="mb-4">
              {notice}
            </Alert>
          )}
          {error && (
            <Alert kind="error" className="mb-4">
              {error}
            </Alert>
          )}

          {/* مبدّل الوضع */}
          <div className="mb-5 flex gap-1.5 rounded-xl bg-slate-100 p-1">
            {[
              { id: "login" as const, label: "دخول" },
              { id: "register" as const, label: "حساب جديد" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchMode(tab.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  mode === tab.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form onSubmit={submitLogin} className="space-y-4">
              <Field label="اسم المستخدم">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="اسم المستخدم الخاص بك"
                  autoComplete="username"
                  required
                  dir="ltr"
                  className="text-right"
                />
              </Field>

              <Field label="كلمة المرور">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  className="text-right"
                />
              </Field>

              <Button type="submit" size="lg" className="w-full" disabled={loading || checking}>
                {loading ? (
                  <>
                    <Spinner /> جارٍ التحقق...
                  </>
                ) : (
                  "دخول النظام"
                )}
              </Button>

              <p className="text-center text-xs text-slate-500">
                ليس لديك حساب؟{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-bold text-brand-600 hover:underline"
                >
                  أنشئ حساب معلم
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={submitRegister} className="space-y-4">
              <Field label="اسم المعلم (الثلاثي أو الرباعي)" hint="سيظهر في الكشوف الرسمية">
                <Input
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="مثال: عبدالله محمد سعد الحربي"
                  required
                />
              </Field>

              <Field label="اسم المستخدم" hint="بالإنجليزية — يستخدم للدخول فقط">
                <Input
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="teacher.abdullah"
                  autoComplete="username"
                  required
                  dir="ltr"
                  className="text-right"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="كلمة المرور" hint="٦ أحرف على الأقل">
                  <Input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    dir="ltr"
                    className="text-right"
                  />
                </Field>
                <Field label="تأكيد كلمة المرور">
                  <Input
                    type="password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    dir="ltr"
                    className="text-right"
                  />
                </Field>
              </div>

              {/* بيانات المدرسة — اختيارية */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <button
                  type="button"
                  onClick={() => setShowSchoolFields((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-right text-xs font-bold text-slate-700"
                >
                  <span>🏫 بيانات المدرسة ومديرها (اختياري — يمكن تعديلها لاحقاً من الإعدادات)</span>
                  <span className="text-slate-400">{showSchoolFields ? "▲" : "▼"}</span>
                </button>
                {showSchoolFields && (
                  <div className="mt-3 grid gap-3">
                    <Field label="اسم المدرسة">
                      <Input
                        value={regSchool}
                        onChange={(e) => setRegSchool(e.target.value)}
                        placeholder="مثال: مدرسة الملك فهد الابتدائية"
                      />
                    </Field>
                    <Field label="إدارة التعليم / المنطقة">
                      <Input
                        value={regAdmin}
                        onChange={(e) => setRegAdmin(e.target.value)}
                        placeholder="إدارة التعليم — منطقة الرياض"
                      />
                    </Field>
                    <Field label="اسم مدير المدرسة">
                      <Input
                        value={regHeadmaster}
                        onChange={(e) => setRegHeadmaster(e.target.value)}
                        placeholder="الاسم الثلاثي للمدير"
                      />
                    </Field>
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading || checking}>
                {loading ? (
                  <>
                    <Spinner /> جارٍ إنشاء الحساب...
                  </>
                ) : (
                  "إنشاء الحساب والدخول"
                )}
              </Button>

              {!noAccounts && (
                <p className="text-center text-xs text-slate-500">
                  لديك حساب بالفعل؟{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="font-bold text-brand-600 hover:underline"
                  >
                    تسجيل الدخول
                  </button>
                </p>
              )}
            </form>
          )}

          <p className="mt-6 text-center text-[11px] leading-6 text-slate-400">
            كلمات المرور مشفّرة بالكامل (bcrypt) ولا يمكن استرجاعها أو عرضها من النظام.
          </p>
        </div>
      </div>
    </main>
  );
}
