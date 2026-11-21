import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PrintSettings } from "./OfficialHeader";

const FALLBACK: PrintSettings = {
  schoolName: "مدرستي",
  administration: "إدارة التعليم",
  ministryOffice: "وزارة التعليم",
  teacherName: "معلم المادة",
  academicYear: "1447 هـ",
  semester: "الفصل الدراسي الأول",
  headmasterName: "مدير المدرسة",
};

/**
 * بيانات الترويسة الرسمية:
 *  - بيانات المدرسة والإدارة ومدير المدرسة والعام الدراسي: مشتركة للجميع
 *  - اسم المعلم: يُؤخذ من حساب المعلم الذي يطبع الكشف
 */
export async function loadPrintSettings(userId: number): Promise<PrintSettings> {
  const result = await db.execute<PrintSettings & { user_name: string | null }>(sql`
    SELECT s.school_name AS "schoolName", s.administration,
           s.ministry_office AS "ministryOffice",
           s.teacher_name AS "teacherName",
           s.academic_year AS "academicYear", s.semester,
           s.headmaster_name AS "headmasterName",
           u.full_name AS user_name
    FROM app_settings s
    LEFT JOIN users u ON u.id = ${userId}
    WHERE s.id = 1 LIMIT 1
  `);
  const row = result.rows?.[0];
  if (!row) return FALLBACK;

  const teacherName =
    row.user_name && row.user_name.trim() !== ""
      ? row.user_name
      : row.teacherName && row.teacherName.trim() !== ""
        ? row.teacherName
        : FALLBACK.teacherName;

  return { ...FALLBACK, ...row, teacherName };
}
