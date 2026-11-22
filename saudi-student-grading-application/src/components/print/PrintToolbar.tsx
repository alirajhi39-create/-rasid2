"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type PrintOrientation = "landscape" | "portrait";

/**
 * التوجيه الافتراضي: أفقي (Landscape) — ويمكن التبديل إلى عمودي (Portrait).
 * يُطبَّق عبر إضافة صنف على جذر صفحة الطباعة.
 */
const KEY = "print-orientation";

export function getStoredOrientation(): PrintOrientation {
  if (typeof window === "undefined") return "landscape";
  return window.localStorage.getItem(KEY) === "portrait" ? "portrait" : "landscape";
}

export default function PrintToolbar({
  title,
  autoPrint = true,
  orientation,
  onOrientationChange,
  hideNid = false,
  supportsNid = true,
}: {
  title: string;
  autoPrint?: boolean;
  /** حالة اتجاه الطباعة (اختياري — إن لم تُمرَّر يُستخدم المخزَّن محلياً) */
  orientation?: PrintOrientation;
  onOrientationChange?: (value: PrintOrientation) => void;
  /** إخفاء عمود السجل المدني من الطباعة */
  hideNid?: boolean;
  /** هل هذه الصفحة تطبع السجل المدني أصلاً؟ */
  supportsNid?: boolean;
}) {
  const [dir, setDir] = useState<PrintOrientation>(orientation ?? "landscape");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDir(orientation ?? getStoredOrientation());
    setReady(true);
  }, [orientation]);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.remove("print-landscape", "print-portrait");
    root.classList.add(dir === "portrait" ? "print-portrait" : "print-landscape");
    window.localStorage.setItem(KEY, dir);
  }, [dir, ready]);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => window.print(), 900);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  const change = (value: PrintOrientation) => {
    setDir(value);
    onOrientationChange?.(value);
  };

  /** تبديل إظهار/إخفاء السجل المدني عبر معامل في الرابط (يُعاد رسم الصفحة من الخادم) */
  const toggleNid = () => {
    const url = new URL(window.location.href);
    if (hideNid) url.searchParams.delete("hideNid");
    else url.searchParams.set("hideNid", "1");
    window.location.href = url.toString();
  };

  return (
    <div className="no-print sticky top-0 z-20 mb-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-800">{title}</p>
          <p className="text-[11px] text-slate-500">
            الاتجاه الافتراضي <b>أفقي (Landscape)</b> — يمكنك التبديل إلى <b>عمودي</b>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* إخفاء السجل المدني */}
          {supportsNid && (
            <button
              type="button"
              onClick={toggleNid}
              title={
                hideNid
                  ? "إظهار عمود رقم السجل المدني في الطباعة"
                  : "إخفاء عمود رقم السجل المدني عن الطباعة"
              }
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                hideNid
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {hideNid ? "🙈 إخفاء السجل المدني (مفعّل)" : "👁 إظهار السجل المدني"}
            </button>
          )}

          {/* مبدّل الاتجاه */}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: "landscape" as const, label: "🔀 أفقي", title: "A4 بالعرض — الافتراضي" },
              { id: "portrait" as const, label: "▯ عمودي", title: "A4 بالطول" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.title}
                onClick={() => change(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  dir === option.id
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Link
            href="/dashboard/reports"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            ↩︎ رجوع
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
    </div>
  );
}
