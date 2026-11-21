import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="rounded-2xl bg-white/90 px-8 py-6 text-sm font-bold text-slate-600 shadow">
            جارٍ التحميل...
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
