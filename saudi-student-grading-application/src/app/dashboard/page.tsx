import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

type Stats = {
  classrooms: number;
  students: number;
  subjects: number;
  graded: number;
  avg_total: string | null;
};

type RecentRow = {
  id: number;
  grade: string;
  section: string;
  subject_name: string;
  students_count: number;
  graded_count: number;
  total_max: string;
  passing_score: string;
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const uid = session.uid;

  await ensureDatabase().catch(() => undefined);

  let stats: Stats = { classrooms: 0, students: 0, subjects: 0, graded: 0, avg_total: null };
  let recent: RecentRow[] = [];
  let dbError: string | null = null;

  try {
    const statsResult = await db.execute<Stats>(sql`
      SELECT
        (SELECT count(*)::int FROM classrooms WHERE user_id = ${uid}) AS classrooms,
        (SELECT count(*)::int FROM students st JOIN classrooms c ON c.id = st.classroom_id
           WHERE c.user_id = ${uid}) AS students,
        (SELECT count(*)::int FROM subjects su JOIN classrooms c ON c.id = su.classroom_id
           WHERE c.user_id = ${uid}) AS subjects,
        (SELECT count(*)::int FROM grades g JOIN subjects su ON su.id = g.subject_id
           JOIN classrooms c ON c.id = su.classroom_id WHERE c.user_id = ${uid}) AS graded,
        (SELECT ROUND(AVG(g.total), 2)::text FROM grades g JOIN subjects su ON su.id = g.subject_id
           JOIN classrooms c ON c.id = su.classroom_id WHERE c.user_id = ${uid}) AS avg_total
    `);
    stats = statsResult.rows?.[0] ?? stats;

    const recentResult = await db.execute<RecentRow>(sql`
      SELECT s.id, c.grade, c.section, s.name AS subject_name,
             (SELECT count(*)::int FROM students st WHERE st.classroom_id = s.classroom_id) AS students_count,
             (SELECT count(*)::int FROM grades g WHERE g.subject_id = s.id) AS graded_count,
             s.total_max, s.passing_score
      FROM subjects s JOIN classrooms c ON c.id = s.classroom_id
      WHERE c.user_id = ${uid}
      ORDER BY s.updated_at DESC
      LIMIT 8
    `);
    recent = recentResult.rows ?? [];
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
  }

  const cards = [
    { label: "الفصول", value: stats.classrooms, icon: "🏫", tone: "from-brand-500 to-brand-700" },
    { label: "الطلاب", value: stats.students, icon: "👨‍🎓", tone: "from-emerald-500 to-emerald-700" },
    { label: "المواد", value: stats.subjects, icon: "📚", tone: "from-violet-500 to-violet-700" },
    { label: "درجات مرصدة", value: stats.graded, icon: "✍️", tone: "from-amber-500 to-amber-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* الترويسة الترحيبية */}
      <div className="animate-fade-up relative overflow-hidden rounded-3xl bg-gradient-to-l from-brand-800 via-brand-700 to-brand-600 shadow-xl shadow-brand-900/20">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
        <div className="relative grid gap-4 sm:grid-cols-[1fr_auto] sm:items-stretch">
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold text-brand-200">لوحة التحكم</p>
          <h1 className="mt-1.5 text-2xl font-extrabold sm:text-3xl">مرحباً بك في نظام رصد الدرجات</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-brand-100">
            نظام متكامل لإدارة ورصد درجات الطلاب وفق لائحة تقويم الطالب في التعليم العام — يدعم توزيع
            الدرجات المرن، الحفظ التلقائي في السحابة، والتقارير الرسمية القابلة للطباعة.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/dashboard/grades"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-700 shadow transition hover:bg-brand-50"
            >
              ✍️ ابدأ الرصد الآن
            </Link>
            <Link
              href="/dashboard/students"
              className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
            >
              👨‍🎓 إدارة الطلاب
            </Link>
            <Link
              href="/dashboard/reports"
              className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
            >
              🖨️ التقارير
            </Link>
          </div>

          {/* صورة الطالب */}
          <div className="relative hidden self-stretch sm:block">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-l from-transparent to-brand-700" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/hero-student.jpg"
              alt="طالب أثناء الدراسة"
              className="h-full min-h-56 w-full object-cover object-top"
            />
            </div>
          </div>
        </div>
      </div>

      {dbError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-bold">تعذر قراءة البيانات من قاعدة البيانات</p>
          <p dir="ltr" className="mt-1 font-mono text-xs opacity-80">
            {dbError}
          </p>
        </div>
      )}

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="animate-fade-up rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5"
          >
            <div
              className={`mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${card.tone} text-xl text-white shadow`}
            >
              {card.icon}
            </div>
            <p className="text-2xl font-extrabold tabular-nums text-slate-800 sm:text-3xl">
              {card.value.toLocaleString("ar-EG")}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* آخر المواد */}
      <div className="animate-fade-up rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">المواد الدراسية</h2>
            <p className="mt-0.5 text-xs text-slate-500">آخر المواد التي تم تحديثها ونسبة اكتمال الرصد</p>
          </div>
          <Link
            href="/dashboard/subjects"
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
          >
            إدارة المواد
          </Link>
        </header>

        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-3 text-sm font-bold text-slate-600">لا توجد مواد بعد</p>
            <p className="mt-1 text-xs text-slate-500">
              ابدأ بإضافة فصل دراسي ثم مادة مع توزيع درجاتها
            </p>
            <Link
              href="/dashboard/students"
              className="mt-4 inline-block rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"
            >
              إضافة فصل دراسي
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((row) => {
              const pct =
                row.students_count > 0 ? Math.round((row.graded_count / row.students_count) * 100) : 0;
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100">
                    {row.section}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{row.subject_name}</p>
                    <p className="text-[11px] text-slate-500">
                      الصف {row.grade} — فصل {row.section} · الدرجة العظمى{" "}
                      {Number(row.total_max).toLocaleString("ar-EG")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden w-32 sm:block">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-emerald-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        رصد {row.graded_count} من {row.students_count} طالب
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/grades?subjectId=${row.id}`}
                      className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
                    >
                      رصد
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* دليل سريع */}
      <div className="animate-fade-up grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: "①",
            title: "أضف الفصل والطلاب",
            text: "أنشئ الفصل ثم أضف الطلاب يدوياً أو استوردهم من ملف Excel أو كشف نور.",
            href: "/dashboard/students",
          },
          {
            icon: "②",
            title: "حدد توزيع الدرجات",
            text: "اختر قالباً جاهزاً (٦٠+٤٠ أو تقويم مستمر) أو خصص خاناتك مع الدرجة العظمى.",
            href: "/dashboard/subjects",
          },
          {
            icon: "③",
            title: "ارصد واطبع",
            text: "ارصد الدرجات بحفظ تلقائي، ثم اطبع الكشوف الرسمية أو صدّرها لنظام نور.",
            href: "/dashboard/grades",
          },
        ].map((step) => (
          <Link
            key={step.title}
            href={step.href}
            className="group rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <p className="text-lg font-extrabold text-brand-600">{step.icon}</p>
            <p className="mt-1.5 text-sm font-bold text-slate-800 group-hover:text-brand-700">
              {step.title}
            </p>
            <p className="mt-1 text-xs leading-6 text-slate-500">{step.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
