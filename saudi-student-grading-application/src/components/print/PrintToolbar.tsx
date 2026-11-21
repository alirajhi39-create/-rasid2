"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PrintToolbar({
  title,
  autoPrint = true,
}: {
  title: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="no-print sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-extrabold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">
          استخدم A4 بالعرض لكشوف الفصل، وA4 بالطول للإشعارات الفردية
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard/reports"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
        >
          ↩︎ رجوع للتقارير
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
        >
          🖨️ طباعة الآن
        </button>
      </div>
    </div>
  );
}
