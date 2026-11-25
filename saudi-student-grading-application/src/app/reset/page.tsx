"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "تعذر إعادة تعيين كلمة المرور");
        return;
      }
      setSuccess(data.message ?? "تم بنجاح");
      setTimeout(() => router.replace("/login"), 1600);
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
      </div>

      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/90 p-7 shadow-2xl shadow-slate-300/40 backdrop-blur-xl">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-3xl ring-1 ring-brand-100">
            🔑
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-slate-800">إعادة تعيين كلمة المرور</h1>
          <p className="mt-1.5 text-sm text-slate-500">اختر كلمة مرور جديدة لحسابك</p>
        </div>

        {error && (
          <Alert kind="error" className="mt-5">
            {error}
          </Alert>
        )}
        {success && (
          <Alert kind="success" className="mt-5">
            {success} — يتم تحويلك لصفحة الدخول...
          </Alert>
        )}

        {!token ? (
          <Alert kind="error" className="mt-5">
            رابط الاستعادة غير صالح.{" "}
            <Link href="/login" className="font-bold underline">
              العودة لصفحة الدخول
            </Link>
          </Alert>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="كلمة المرور الجديدة" hint="٦ أحرف على الأقل">
              <Input
                type="password"
                dir="ltr"
                className="text-right"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <Input
                type="password"
                dir="ltr"
                className="text-right"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </Field>

            <Button type="submit" size="lg" className="w-full" disabled={loading || !!success}>
              {loading ? (
                <>
                  <Spinner /> جارٍ التحديث...
                </>
              ) : (
                "تعيين كلمة المرور"
              )}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-slate-500">
          <Link href="/login" className="font-bold text-brand-600 hover:underline">
            ↩︎ العودة لتسجيل الدخول
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Spinner className="text-brand-600" />
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
