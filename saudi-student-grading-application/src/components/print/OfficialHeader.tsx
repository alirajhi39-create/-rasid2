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

/**
 * =====================================================================
 *  الترويسة الرسمية للتقارير
 *
 *  التخطيط:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ اسم المدرسة (يمين)     [الشعار] + المملكة + الوزارة (وسط)    │
 *   │                                                              │
 *   │                    العام الدراسي ١٤٤٨هـ                      │
 *   │                          العنوان                              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *  • اسم المدرسة في اليمين
 *  • سطر إدارة التعليم يظهر فقط إذا أُدخل في الإعدادات (اختياري)
 *  • «العام الدراسي» والعام على يسار النص
 *  • لا يوجد أي مربّع «الرقم الآلي / المدرسة» — حُذف من الترويسة
 * =====================================================================
 */
export function OfficialHeader({
  settings,
  title,
  meta,
}: {
  settings: PrintSettings;
  title: string;
  meta?: ReactNode;
}) {
  const year = (settings.academicYear ?? "").trim() || "—";
  const administration = (settings.administration ?? "").trim();
  const schoolName = (settings.schoolName ?? "").trim();

  return (
    <header className="avoid-break mb-4 border-b-2 border-double border-slate-800 pb-3">
      {/* صف الترويسة — شبكة ثلاثية متساوية لضمان محاذاة كاملة:
          العمود الأيمن = الإدارة والمدرسة | الوسط = الشعار والوزارة | الأيسر = متوازن */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-x-3">
        {/* الأيمن: إدارة التعليم (عريض) ثم اسم المدرسة */}
        <div className="min-w-0 pt-0.5 text-right">
          {administration && (
            <p className="text-[11pt] leading-5 font-extrabold text-slate-900">{administration}</p>
          )}
          {schoolName && (
            <p
              className={`leading-5 font-extrabold text-slate-900 ${
                administration ? "text-[10pt]" : "text-[11pt]"
              }`}
            >
              {schoolName}
            </p>
          )}
        </div>

        {/* الوسط: الشعار + المملكة العربية السعودية + وزارة التعليم */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <MinistryLogo size={56} />
          <p className="mt-0.5 text-[10pt] leading-4 font-extrabold text-slate-900">
            المملكة العربية السعودية
          </p>
          <p className="text-[10.5pt] leading-4 font-extrabold text-emerald-800">
            {settings.ministryOffice}
          </p>
        </div>

        {/* الأيسر: عمود متوازن (فارغ) ليظل الشعار في منتصف الصفحة تماماً */}
        <div className="min-w-0" aria-hidden />
      </div>

      {/* العام الدراسي — العام على يسار النص */}
      <div className="mt-2.5 flex justify-center">
        <span className="rounded border border-slate-400 bg-slate-50 px-4 py-1 text-[10.5pt] font-bold text-slate-800">
          العام الدراسي {year}
        </span>
      </div>

      {/* العنوان */}
      <h1 className="mt-2 text-center text-[14pt] font-extrabold text-slate-900 underline decoration-2 underline-offset-4">
        {title}
      </h1>
      {meta && (
        <div className="mt-1.5 text-center text-[10pt] font-bold text-slate-700">{meta}</div>
      )}
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
