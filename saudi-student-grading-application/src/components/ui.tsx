"use client";

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";

/* ---------------------------------- Card --------------------------------- */
export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/60 backdrop-blur ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-base font-bold text-slate-800 sm:text-lg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/* --------------------------------- Button -------------------------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-400 shadow-sm shadow-brand-600/20",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-300",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-300",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm sm:text-base",
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

/* --------------------------------- Field --------------------------------- */
export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

const controlClasses =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${controlClasses} ${className}`} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${controlClasses} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${controlClasses} min-h-28 leading-7 ${className}`} />;
}

/* --------------------------------- Badge --------------------------------- */
export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: "slate" | "brand" | "emerald" | "rose" | "amber" | "sky" | "violet" | "orange";
  className?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    brand: "bg-brand-50 text-brand-700 ring-brand-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Alert --------------------------------- */
export function Alert({
  kind = "info",
  children,
  className = "",
}: {
  kind?: "info" | "success" | "error" | "warn";
  children: ReactNode;
  className?: string;
}) {
  const kinds = {
    info: "bg-sky-50 text-sky-800 border-sky-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    error: "bg-rose-50 text-rose-800 border-rose-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
  };
  const icons = { info: "ℹ️", success: "✅", error: "⚠️", warn: "🔔" };
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${kinds[kind]} ${className}`}>
      <span aria-hidden>{icons[kind]}</span>
      <div className="flex-1 leading-6">{children}</div>
    </div>
  );
}

/* -------------------------------- Spinner -------------------------------- */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

/* -------------------------------- Empty ---------------------------------- */
export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <h3 className="text-base font-bold text-slate-700">{title}</h3>
      {description && <p className="max-w-md text-sm leading-7 text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

/* -------------------------------- Modal ---------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={`animate-pop max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="إغلاق"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Toast ---------------------------------- */
export type ToastItem = { id: number; kind: "success" | "error" | "info"; text: string };

export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((toast) => {
        const tones = {
          success: "bg-emerald-600 text-white",
          error: "bg-rose-600 text-white",
          info: "bg-slate-800 text-white",
        };
        return (
          <button
            key={toast.id}
            type="button"
            onClick={() => onDismiss(toast.id)}
            className={`animate-fade-up pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${tones[toast.kind]}`}
          >
            {toast.text}
          </button>
        );
      })}
    </div>
  );
}
