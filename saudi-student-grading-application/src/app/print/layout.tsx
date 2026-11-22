import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 print-shell">
      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 print-shell-inner">{children}</div>
    </div>
  );
}
