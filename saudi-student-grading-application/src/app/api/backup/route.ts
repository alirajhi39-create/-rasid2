import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { computeTotalMax, normalizeItems } from "@/lib/grades";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKUP_VERSION = 1;

type BackupClassroom = {
  ref: number;
  grade: string;
  section: string;
  stage: string;
};

type BackupStudent = {
  ref: number;
  classroomRef: number;
  fullName: string;
  nationalId: string | null;
  classNumber: number | null;
  notes: string | null;
};

type BackupSubject = {
  ref: number;
  classroomRef: number | null;
  name: string;
  items: ScoreItem[];
  totalMax: number;
  passingScore: number;
};

type BackupGrade = {
  studentRef: number;
  subjectRef: number;
  semester: string;
  values: GradeValues;
  total: number;
};

type BackupFile = {
  version: number;
  exportedAt: string;
  app: string;
  teacher: { username: string; fullName: string };
  settings: Record<string, string> | null;
  classrooms: BackupClassroom[];
  students: BackupStudent[];
  subjects: BackupSubject[];
  grades: BackupGrade[];
};

/**
 * =====================================================================
 *  GET /api/backup  — تصدير نسخة احتياطية كاملة (JSON) لأسماء الطلاب ودرجاتهم
 *  POST /api/backup — استعادة نسخة احتياطية (يستبدل بيانات المعلم الحالية)
 * =====================================================================
 */
export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const classrooms = await db.execute<{
      id: number;
      grade: string;
      section: string;
      stage: string;
    }>(
      sql`SELECT id, grade, section, stage FROM classrooms
          WHERE user_id = ${guard.session.uid}
          ORDER BY id`,
    );

    const students = await db.execute<{
      id: number;
      classroom_id: number;
      full_name: string;
      national_id: string | null;
      class_number: number | null;
      notes: string | null;
    }>(sql`
      SELECT st.id, st.classroom_id, st.full_name, st.national_id, st.class_number, st.notes
      FROM students st
      JOIN classrooms c ON c.id = st.classroom_id
      WHERE c.user_id = ${guard.session.uid}
      ORDER BY st.id
    `);

    const subjects = await db.execute<{
      id: number;
      classroom_id: number | null;
      name: string;
      items: ScoreItem[];
      total_max: string;
      passing_score: string;
    }>(sql`
      SELECT s.id, s.classroom_id, s.name, s.items, s.total_max, s.passing_score
      FROM subjects s
      WHERE s.user_id = ${guard.session.uid}
      ORDER BY s.id
    `);

    const grades = await db.execute<{
      student_id: number;
      subject_id: number;
      semester: string;
      values: GradeValues | null;
      total: string | null;
    }>(sql`
      SELECT g.student_id, g.subject_id, g.semester, g.values, g.total
      FROM grades g
      JOIN subjects s ON s.id = g.subject_id
      WHERE s.user_id = ${guard.session.uid}
      ORDER BY g.id
    `);

    const settings = await db.execute<Record<string, string>>(
      sql`SELECT school_name, administration, ministry_office, academic_year,
                 semester, headmaster_name
          FROM app_settings WHERE id = 1 LIMIT 1`,
    );

    // تحويل المعرّفات المحلية إلى مراجع رقمية قابلة للنقل بين الأجهزة
    const classroomIdMap = new Map<number, number>();
    const backupClassrooms: BackupClassroom[] = (classrooms.rows ?? []).map((c, index) => {
      classroomIdMap.set(c.id, index + 1);
      return { ref: index + 1, grade: c.grade, section: c.section, stage: c.stage };
    });

    const studentIdMap = new Map<number, number>();
    const backupStudents: BackupStudent[] = (students.rows ?? []).map((s, index) => {
      studentIdMap.set(s.id, index + 1);
      return {
        ref: index + 1,
        classroomRef: classroomIdMap.get(s.classroom_id) ?? 0,
        fullName: s.full_name,
        nationalId: s.national_id,
        classNumber: s.class_number,
        notes: s.notes,
      };
    });

    const subjectIdMap = new Map<number, number>();
    const backupSubjects: BackupSubject[] = (subjects.rows ?? []).map((s, index) => {
      subjectIdMap.set(s.id, index + 1);
      const items = normalizeItems(s.items ?? []);
      return {
        ref: index + 1,
        classroomRef: s.classroom_id ? (classroomIdMap.get(s.classroom_id) ?? null) : null,
        name: s.name,
        items,
        totalMax: computeTotalMax(items),
        passingScore: Number(s.passing_score),
      };
    });

    const backupGrades: BackupGrade[] = (grades.rows ?? []).map((g) => ({
      studentRef: studentIdMap.get(g.student_id) ?? 0,
      subjectRef: subjectIdMap.get(g.subject_id) ?? 0,
      semester: g.semester === "second" ? "second" : "first",
      values: (g.values ?? {}) as GradeValues,
      total: Number(g.total ?? 0),
    }));

    const backup: BackupFile = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app: "rasd-grades-backup",
      teacher: { username: guard.session.username, fullName: guard.session.fullName },
      settings: (settings.rows?.[0] as Record<string, string>) ?? null,
      classrooms: backupClassrooms,
      students: backupStudents,
      subjects: backupSubjects,
      grades: backupGrades,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = encodeURIComponent(`نسخة-احتياطية-${stamp}.json`);

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر إنشاء النسخة الاحتياطية",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * استعادة نسخة احتياطية.
 * يستبدل كل بيانات المعلم الحالية (فصول + طلاب + مواد + درجات) بمحتوى الملف.
 */
export async function POST(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => null)) as BackupFile | null;
    if (!body || !Array.isArray(body.classrooms) || !Array.isArray(body.students)) {
      return NextResponse.json(
        { ok: false, error: "ملف النسخة الاحتياطية غير صالح" },
        { status: 400 },
      );
    }
    if (body.app && body.app !== "rasd-grades-backup") {
      return NextResponse.json(
        { ok: false, error: "هذا الملف ليس نسخة احتياطية من النظام" },
        { status: 400 },
      );
    }

    const uid = guard.session.uid;

    // ١) حذف البيانات الحالية لهذا المعلم فقط ( CASCADE يحذف الطلاب والمواد والدرجات )
    await db.execute(sql`DELETE FROM classrooms WHERE user_id = ${uid}`);

    // ٢) إدراج الفصول
    const refToClassroomId = new Map<number, number>();
    for (const classroom of body.classrooms ?? []) {
      const grade = String(classroom.grade ?? "").trim();
      const section = String(classroom.section ?? "").trim();
      if (!grade || !section) continue;
      const inserted = await db.execute<{ id: number }>(
        sql`INSERT INTO classrooms (grade, section, stage, user_id)
            VALUES (${grade}, ${section}, ${String(classroom.stage ?? "ابتدائي").trim()}, ${uid})
            RETURNING id`,
      );
      const id = inserted.rows?.[0]?.id;
      if (id) refToClassroomId.set(Number(classroom.ref) || refToClassroomId.size + 1, id);
    }

    // ٣) إدراج الطلاب
    const refToStudentId = new Map<number, number>();
    for (const student of body.students ?? []) {
      const fullName = String(student.fullName ?? "").replace(/\s+/g, " ").trim();
      const classroomId = refToClassroomId.get(Number(student.classroomRef));
      if (!fullName || !classroomId) continue;
      const nationalId = String(student.nationalId ?? "").replace(/\D/g, "") || null;
      const classNumber =
        student.classNumber === null || student.classNumber === undefined
          ? null
          : Number(student.classNumber);

      const inserted = await db.execute<{ id: number }>(
        sql`INSERT INTO students (full_name, national_id, classroom_id, class_number, notes)
            VALUES (${fullName}, ${nationalId}, ${classroomId},
                    ${Number.isFinite(classNumber as number) ? classNumber : null},
                    ${student.notes ?? null})
            RETURNING id`,
      );
      const id = inserted.rows?.[0]?.id;
      if (id) refToStudentId.set(Number(student.ref) || refToStudentId.size + 1, id);
    }

    // ٤) إدراج المواد (مع تحقق من الدرجة العظمى)
    const refToSubjectId = new Map<number, number>();
    for (const subject of body.subjects ?? []) {
      const name = String(subject.name ?? "").trim();
      if (!name) continue;
      const classroomId =
        subject.classroomRef === null || subject.classroomRef === undefined
          ? null
          : (refToClassroomId.get(Number(subject.classroomRef)) ?? null);

      const items = normalizeItems((subject.items ?? []) as ScoreItem[])
        .map((item, index): ScoreItem => ({
          id: item.id || `bk_${Date.now().toString(36)}_${index}`,
          label: String(item.label ?? "").trim(),
          max: Math.max(0, Number(item.max) || 0),
          group: item.group,
          kind: item.kind ?? "custom",
          period: item.period,
        }))
        .filter((i) => i.label && i.max > 0);

      if (items.length === 0) continue;
      const totalMax = computeTotalMax(items);
      const passing =
        Number(subject.passingScore) > 0 ? Number(subject.passingScore) : Math.round(totalMax / 2);

      const inserted = await db.execute<{ id: number }>(
        sql`INSERT INTO subjects (name, classroom_id, user_id, items, total_max, passing_score)
            VALUES (${name}, ${classroomId}, ${uid}, ${JSON.stringify(items)}::jsonb, ${totalMax}, ${passing})
            RETURNING id`,
      );
      const id = inserted.rows?.[0]?.id;
      if (id) refToSubjectId.set(Number(subject.ref) || refToSubjectId.size + 1, id);
    }

    // ٥) إدراج الدرجات
    let gradesInserted = 0;
    for (const grade of body.grades ?? []) {
      const studentId = refToStudentId.get(Number(grade.studentRef));
      const subjectId = refToSubjectId.get(Number(grade.subjectRef));
      if (!studentId || !subjectId) continue;

      const semester = grade.semester === "second" ? "second" : "first";
      const values = (grade.values ?? {}) as GradeValues;
      const total = Number(grade.total) || 0;

      await db.execute(sql`
        INSERT INTO grades (student_id, subject_id, semester, values, total)
        VALUES (${studentId}, ${subjectId}, ${semester}, ${JSON.stringify(values)}::jsonb, ${total})
        ON CONFLICT (student_id, subject_id, semester)
        DO UPDATE SET values = ${JSON.stringify(values)}::jsonb, total = ${total}, updated_at = now()
      `);
      gradesInserted++;
    }

    // ٦) بيانات المدرسة (إن وُجدت في النسخة)
    if (body.settings && typeof body.settings === "object") {
      const sets: string[] = [];
      const map: Record<string, string> = {
        school_name: "schoolName",
        administration: "administration",
        ministry_office: "ministryOffice",
        academic_year: "academicYear",
        semester: "semester",
        headmaster_name: "headmasterName",
      };
      for (const [column, key] of Object.entries(map)) {
        const value = body.settings[key];
        if (typeof value === "string" && value.trim()) {
          sets.push(`${column} = '${value.trim().replace(/'/g, "''")}'`);
        }
      }
      if (sets.length) {
        await db.execute(
          sql.raw(`UPDATE app_settings SET ${sets.join(", ")}, updated_at = now() WHERE id = 1`),
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: `تمت الاستعادة بنجاح: ${refToClassroomId.size} فصل · ${refToStudentId.size} طالب · ${refToSubjectId.size} مادة · ${gradesInserted} درجة`,
      counts: {
        classrooms: refToClassroomId.size,
        students: refToStudentId.size,
        subjects: refToSubjectId.size,
        grades: gradesInserted,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر استعادة النسخة الاحتياطية",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
