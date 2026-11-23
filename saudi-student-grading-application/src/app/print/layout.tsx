import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * قواعد ضمان العرض — مضمّنة مباشرة في الصفحة حتى لا تعتمد على تحميل
 * ملف CSS خارجي أو على ترتيبه. تمنع أي تجاوز لعرض الصفحة في الطباعة.
 * (لا تتضمَّن قاعدة @page حتى لا تتعارض مع مبدّل الاتجاه في الشريط)
 */
const PRINT_WIDTH_GUARD = `
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden;
  }
  .print-shell,
  .print-shell-inner,
  .print-area {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
  }
  th, td {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}
`;

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 print-shell">
      <style dangerouslySetInnerHTML={{ __html: PRINT_WIDTH_GUARD }} />
      <div className="w-full px-3 py-4 sm:px-5 print-shell-inner">{children}</div>
    </div>
  );
}
