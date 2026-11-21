import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * =====================================================================
 *  مساعدات التحقق من الملكية — تضمن عزل بيانات كل معلم عن غيره
 * =====================================================================
 */

export async function ownsClassroom(classroomId: number, userId: number): Promise<boolean> {
  if (!Number.isFinite(classroomId) || classroomId <= 0) return false;
  const result = await db.execute<{ id: number }>(
    sql`SELECT id FROM classrooms WHERE id = ${classroomId} AND user_id = ${userId} LIMIT 1`,
  );
  return Boolean(result.rows?.[0]);
}

export async function ownsSubject(
  subjectId: number,
  userId: number,
): Promise<{ owned: boolean; classroomId: number | null }> {
  if (!Number.isFinite(subjectId) || subjectId <= 0) return { owned: false, classroomId: null };
  const result = await db.execute<{ classroom_id: number }>(
    sql`SELECT classroom_id FROM subjects WHERE id = ${subjectId} LIMIT 1`,
  );
  const classroomId = result.rows?.[0]?.classroom_id;
  if (!classroomId) return { owned: false, classroomId: null };
  const owned = await ownsClassroom(classroomId, userId);
  return { owned, classroomId: owned ? classroomId : null };
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

/** بيانات المالك الحالي للمادة (للطباعة والتصدير) */
export async function subjectOwnerId(
  subjectId: number,
): Promise<number | null> {
  const result = await db.execute<{ user_id: number }>(
    sql`SELECT c.user_id FROM subjects s JOIN classrooms c ON c.id = s.classroom_id
        WHERE s.id = ${subjectId} LIMIT 1`,
  );
  return result.rows?.[0]?.user_id ?? null;
}
