"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/dashboard", label: "الرئيسية", icon: "🏠", desc: "نظرة عامة" },
  { href: "/dashboard/students", label: "الطلاب والفصول", icon: "👨‍🎓", desc: "إضافة واستيراد" },
  { href: "/dashboard/subjects", label: "المواد والتوزيع", icon: "📚", desc: "خانات الدرجات" },
  { href: "/dashboard/grades", label: "رصد الدرجات", icon: "✍️", desc: "الجدول السريع" },
  { href: "/dashboard/reports", label: "التقارير والطباعة", icon: "🖨️", desc: "PDF ونور" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: "⚙️", desc: "المدرسة والحساب" },
];

export default function Sidebar({
  teacherName,
  schoolName,
  role = "teacher",
  username = "",
}: {
  teacherName: string;
  schoolName: string;
  role?: string;
  username?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            isActive(item.href)
              ? "bg-brand-600 text-white shadow-sm shadow-brand-900/30"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span className="text-lg" aria-hidden>
            {item.icon}
          </span>
          <span className="flex-1">
            {item.label}
            <span
              className={`block text-[10px] font-normal ${
                isActive(item.href) ? "text-brand-100" : "text-slate-400"
              }`}
            >
              {item.desc}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );

  const header = (
    <div className="border-b border-slate-100 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-lg text-white shadow">
          🎓
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-800">رَصْد</p>
          <p className="truncate text-[10px] text-slate-500">{schoolName}</p>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="border-t border-slate-100 p-3">
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-100 text-sm">👤</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-700">{teacherName}</p>
          <p className="truncate text-[10px] text-slate-400" dir="ltr">
            {username || (role === "admin" ? "مدير النظام" : "معلم")}
          </p>
        </div>
        {role === "admin" && (
          <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
            مدير
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100"
      >
        <span aria-hidden>⏻</span> تسجيل الخروج
      </button>
    </div>
  );

  return (
    <>
      {/* شريط الجوال */}
      <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 p-2 text-slate-600"
          aria-label="القائمة"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white">
          🎓
        </div>
        <p className="flex-1 text-sm font-extrabold text-slate-800">رَصْد</p>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600"
        >
          خروج
        </button>
      </header>

      {/* القائمة الجانبية — سطح المكتب */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-slate-200 bg-white/95 backdrop-blur lg:flex">
        {header}
        {nav}
        {footer}
      </aside>

      {/* القائمة الجانبية — الجوال */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="animate-pop absolute inset-y-0 right-0 flex w-72 flex-col bg-white shadow-2xl">
            {header}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
