import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * =====================================================================
 *  مساعدات التحقق من الملكية — تضمن عزل بيانات كل معلم عن غيره
 *  المادة مملوكة لمعلم واحد عبر subjects.user_id حتى بعد فك ربطها بالفصل
 * =====================================================================
 */

export async function ownsClassroom(classroomId: number, userId: number): Promise<boolean> {
  if (!Number.isFinite(classroomId) || classroomId <= 0) return false;
  const result = await db.execute<{ id: number }>(
    sql`SELECT id FROM classrooms WHERE id = ${classroomId} AND user_id = ${userId} LIMIT 1`,
  );
  return Boolean(result.rows?.[0]);
}

/**
 * التحقق من ملكية المادة — يعتمد على subjects.user_id (لا على الفصل)
 * حتى تبقى المادة مملوكة للمعلم بعد فك الربط.
 */
export async function ownsSubject(
  subjectId: number,
  userId: number,
): Promise<{ owned: boolean; classroomId: number | null }> {
  if (!Number.isFinite(subjectId) || subjectId <= 0) return { owned: false, classroomId: null };
  const result = await db.execute<{ classroom_id: number | null }>(
    sql`SELECT classroom_id FROM subjects WHERE id = ${subjectId} AND user_id = ${userId} LIMIT 1`,
  );
  const row = result.rows?.[0];
  if (!row) return { owned: false, classroomId: null };
  return { owned: true, classroomId: row.classroom_id ?? null };
}

export async function ownsStudent(studentId: number, userId: number): Promise<boolean> {
  if (!Number.isFinite(studentId) || studentId <= 0) return false;
  const result = await db.execute<{ id: number }>(
    sql`SELECT st.id FROM students st
        JOIN classrooms c ON c.id = st.classroom_id
        WHERE st.id = ${studentId} AND c.user_id = ${userId} LIMIT 1`,
  );
  return Boolean(result.rows?.[0]);
}
