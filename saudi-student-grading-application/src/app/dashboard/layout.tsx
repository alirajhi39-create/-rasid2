import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  let schoolName = "مدرستي";
  let teacherName = session.fullName;

  try {
    await ensureDatabase();
    const result = await db.execute<{ school_name: string; teacher_name: string }>(
      sql`SELECT school_name, teacher_name FROM app_settings WHERE id = 1 LIMIT 1`,
    );
    const row = result.rows?.[0];
    if (row) {
      schoolName = row.school_name;
      if (row.teacher_name && row.teacher_name !== "معلم المادة") teacherName = row.teacher_name;
    }
  } catch {
    // تجاهل — تُعرض القيم الافتراضية
  }

  // بيانات الحساب الفعلية (اسم المعلم الخاص به + صلاحيته)
  try {
    const userResult = await db.execute<{ full_name: string; username: string; role: string }>(
      sql`SELECT full_name, username, role FROM users WHERE id = ${session.uid} LIMIT 1`,
    );
    const user = userResult.rows?.[0];
    if (user) {
      teacherName = user.full_name;
      session.fullName = user.full_name;
      session.role = user.role;
      session.username = user.username;
    }
  } catch {
    // تجاهل
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        teacherName={teacherName}
        schoolName={schoolName}
        role={session.role}
        username={session.username}
      />
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</main>
    </div>
  );
}
