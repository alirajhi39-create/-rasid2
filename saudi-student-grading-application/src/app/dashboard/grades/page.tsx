import { Suspense } from "react";
import GradesClient from "./GradesClient";

export const dynamic = "force-dynamic";

export default function GradesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1500px]">
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-20 text-sm font-bold text-slate-600 shadow-sm">
            جارٍ تحميل كشف الرصد...
          </div>
        </div>
      }
    >
      <GradesClient />
    </Suspense>
  );
}
