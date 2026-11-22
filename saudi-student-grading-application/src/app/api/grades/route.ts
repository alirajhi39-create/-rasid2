import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsSubject } from "@/lib/ownership";
import { computeTotal } from "@/lib/grades";
import { semesterFromLabel, toSemester } from "@/lib/constants";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubjectMetaRow = {
  id: number;
  name: string;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
};

type StudentWithGrades = {
  id: number;
  full_name: string;
  national_id: string | null;
  class_number: number | null;
  grade_id: number | null;
  values: GradeValues | null;
  total: string | null;
};

/** حلّ قيمة الفصل الدراسي الافتراضية من إعدادات المدرسة */
async function defaultSemester(): Promise<"first" | "second"> {
  const result = await db.execute<{ semester: string }>(
    sql`SELECT semester FROM app_settings WHERE id = 1 LIMIT 1`,
  );
  return semesterFromLabel(result.rows?.[0]?.semester);
}

/** GET /api/grades?subjectId=1&semester=first */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const subjectId = Number(url.searchParams.get("subjectId"));
  if (!Number.isFinite(subjectId) || subjectId <= 0) {
    return NextResponse.json({ ok: false, error: "معرّف المادة مطلوب" }, { status: 400 });
  }

  const owner = await ownsSubject(subjectId, guard.session.uid);
  if (!owner.owned) {
    return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
  }

  const rawSemester = url.searchParams.get("semester");
  const semester: "first" | "second" = rawSemester
    ? toSemester(rawSemester)
    : await defaultSemester();

  const subjectResult = await db.execute<
    SubjectMetaRow & {
      classroom_id: number | null;
      grade: string | null;
      section: string | null;
      stage: string | null;
    }
  >(sql`
    SELECT s.id, s.name, s.items, s.total_max, s.passing_score, s.classroom_id,
           c.grade, c.section, c.stage
    FROM subjects s LEFT JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ${subjectId} LIMIT 1
  `);
  const subject = subjectResult.rows?.[0];
  if (!subject) {
    return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
  }

  // مادة غير مرتبطة بفصل → لا يوجد طلاب للرصد حتى يربطها المعلم
  if (!subject.classroom_id) {
    return NextResponse.json({
      ok: true,
      semester,
      unlinked: true,
      subject: {
        id: subject.id,
        name: subject.name,
        items: subject.items ?? [],
        totalMax: Number(subject.total_max),
        passingScore: Number(subject.passing_score),
        classroomId: null,
        grade: null,
        section: null,
        stage: null,
      },
      rows: [],
    });
  }

  const studentsResult = await db.execute<StudentWithGrades>(sql`
    SELECT st.id, st.full_name, st.national_id, st.class_number,
           g.id AS grade_id, g.values, g.total
    FROM students st
    LEFT JOIN grades g ON g.student_id = st.id AND g.subject_id = ${subjectId} AND g.semester = ${semester}
    WHERE st.classroom_id = ${subject.classroom_id} AND st.active = true
    ORDER BY COALESCE(st.class_number, 999999), st.full_name
  `);

  return NextResponse.json({
    ok: true,
    semester,
    unlinked: false,
    subject: {
      id: subject.id,
      name: subject.name,
      items: subject.items ?? [],
      totalMax: Number(subject.total_max),
      passingScore: Number(subject.passing_score),
      classroomId: subject.classroom_id,
      grade: subject.grade,
      section: subject.section,
      stage: subject.stage,
    },
    rows: (studentsResult.rows ?? []).map((row) => ({
      studentId: row.id,
      fullName: row.full_name,
      nationalId: row.national_id,
      classNumber: row.class_number,
      values: (row.values ?? {}) as GradeValues,
      total: Number(row.total ?? 0),
    })),
  });
}

/** PUT /api/grades — حفظ تلقائي لدرجات طالب واحد في فصل دراسي محدّد */
export async function PUT(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      studentId?: number;
      subjectId?: number;
      semester?: string;
      values?: GradeValues;
    };

    const studentId = Number(body.studentId);
    const subjectId = Number(body.subjectId);
    if (!Number.isFinite(studentId) || !Number.isFinite(subjectId)) {
      return NextResponse.json({ ok: false, error: "بيانات غير مكتملة" }, { status: 400 });
    }
    if (!(await ownsSubject(subjectId, guard.session.uid)).owned) {
      return NextResponse.json({ ok: false, error: "غير مصرح — هذه المادة ليست من موادك" }, { status: 403 });
    }
    const semester = toSemester(body.semester);

    const subjectResult = await db.execute<SubjectMetaRow>(
      sql`SELECT id, items, total_max, passing_score FROM subjects WHERE id = ${subjectId} LIMIT 1`,
    );
    const subject = subjectResult.rows?.[0];
    if (!subject) {
      return NextResponse.json({ ok: false, error: "المادة غير موجودة" }, { status: 404 });
    }

    const items = subject.items ?? [];
    const incoming = body.values ?? {};

    // تنظيف القيم: أرقام فقط ضمن الحد الأعلى
    const cleaned: GradeValues = {};
    for (const item of items) {
      const raw = incoming[item.id];
      const num = Number(raw);
      cleaned[item.id] = Number.isFinite(num) ? num : null;
    }

    const total = computeTotal(items, cleaned);
    const overflow = items.some((item) => {
      const num = Number(incoming[item.id]);
      return Number.isFinite(num) && num > item.max + 0.0001;
    });

    const savedAt = new Date().toISOString();

    await db.execute(sql`
      INSERT INTO grades (student_id, subject_id, semester, values, total, updated_at)
      VALUES (${studentId}, ${subjectId}, ${semester}, ${JSON.stringify(cleaned)}::jsonb, ${total}, now())
      ON CONFLICT (student_id, subject_id, semester)
      DO UPDATE SET values = ${JSON.stringify(cleaned)}::jsonb, total = ${total}, updated_at = now()
    `);

    return NextResponse.json({
      ok: true,
      semester,
      total,
      overflow,
      savedAt,
      message: "تم الحفظ في السحابة",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر حفظ الدرجة",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
