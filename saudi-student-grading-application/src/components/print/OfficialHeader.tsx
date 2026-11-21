import type { ReactNode } from "react";

export type PrintSettings = {
  schoolName: string;
  administration: string;
  ministryOffice: string;
  teacherName: string;
  academicYear: string;
  semester: string;
  headmasterName: string;
};

/** شعار وزارة التعليم */
export function MinistryLogo({ size = 76 }: { size?: number }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/images/moe-logo.png"
      alt="شعار وزارة التعليم"
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** ترويسة وزارة التعليم الرسمية */
export function OfficialHeader({
  settings,
  title,
  meta,
  subtitle,
}: {
  settings: PrintSettings;
  title: string;
  meta?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="avoid-break mb-4 border-b-2 border-double border-slate-800 pb-3">
      <div className="flex items-center justify-between gap-3">
        {/* الشعار الرسمي */}
        <div className="flex w-24 shrink-0 flex-col items-center gap-1">
          <MinistryLogo size={70} />
        </div>

        {/* البيانات الرسمية */}
        <div className="flex-1 text-center">
          <p className="text-[11pt] font-extrabold text-slate-900">المملكة العربية السعودية</p>
          <p className="text-[12pt] font-extrabold text-emerald-800">{settings.ministryOffice}</p>
          <p className="text-[10pt] font-bold text-slate-700">{settings.administration}</p>
          <p className="text-[10pt] font-bold text-slate-700">{settings.schoolName}</p>
          <div className="mt-1.5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded border border-slate-300 bg-slate-50 px-3 py-1 text-[9pt] font-semibold text-slate-700">
            <span>العام الدراسي: {settings.academicYear}</span>
            {subtitle ?? <span className="text-slate-300">|</span>}
          </div>
          <h1 className="mt-2 text-[14pt] font-extrabold text-slate-900 underline decoration-2 underline-offset-4">
            {title}
          </h1>
          {meta && <div className="mt-1.5 text-[10pt] font-bold text-slate-700">{meta}</div>}
        </div>

        {/* مربع الترميز */}
        <div className="w-24 shrink-0">
          <div className="rounded border border-slate-400 p-1 text-center text-[7pt] font-bold text-slate-600">
            الرقم الآلي
          </div>
          <div className="mt-1 grid h-14 place-items-center rounded border border-slate-400 text-[7pt] text-slate-400">
            المدرسة
          </div>
        </div>
      </div>
    </header>
  );
}

/** تذييل بالتوقيعات — معلم المادة ومدير المدرسة فقط */
export function SignaturesFooter({
  teacherName,
  headmasterName,
  note,
}: {
  teacherName: string;
  headmasterName: string;
  note?: string;
}) {
  return (
    <footer className="avoid-break mt-6">
      {note && <p className="mb-4 text-[9pt] font-semibold text-slate-600">{note}</p>}
      <div className="grid grid-cols-2 gap-8 text-center text-[10pt] font-bold text-slate-800">
        <div>
          <p className="mb-10">معلم المادة</p>
          <p className="border-t border-dotted border-slate-500 pt-1">{teacherName}</p>
        </div>
        <div>
          <p className="mb-10">مدير المدرسة</p>
          <p className="border-t border-dotted border-slate-500 pt-1">{headmasterName}</p>
        </div>
      </div>
    </footer>
  );
}
