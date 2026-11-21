import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * =====================================================================
 *  التهيئة التلقائية لقاعدة البيانات (Auto-Migration)
 *  تُنشئ جميع الجداول عند أول تشغيل + تُدرج الإعدادات العامة للمدرسة.
 *  لا يتم إنشاء أي حساب افتراضي ولا تُخزَّن/تُعرض أي كلمة مرور في الكود.
 *  أول معلم يُسجّل حسابه من صفحة الدخول يصبح مدير النظام.
 *  تُستدعى من: GET/POST /api/init-db
 * =====================================================================
 */

async function runRaw(statement: string) {
  await db.execute(sql.raw(statement));
}

export async function initDatabase() {
  const steps: string[] = [];

  /* ----------------------- users ----------------------- */
  await runRaw(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      username text NOT NULL,
      password_hash text NOT NULL,
      full_name text NOT NULL DEFAULT 'معلم المادة',
      role text NOT NULL DEFAULT 'teacher',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await runRaw(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username)`);
  steps.push("users");

  /* ----------------------- app_settings ----------------------- */
  await runRaw(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id integer PRIMARY KEY DEFAULT 1,
      school_name text NOT NULL DEFAULT 'مدرسة الأمير عبدالله بن عبدالعزيز',
      administration text NOT NULL DEFAULT 'إدارة التعليم - منطقة الرياض',
      ministry_office text NOT NULL DEFAULT 'وزارة التعليم',
      teacher_name text NOT NULL DEFAULT 'معلم المادة',
      academic_year text NOT NULL DEFAULT '1447 هـ',
      semester text NOT NULL DEFAULT 'الفصل الدراسي الأول',
      headmaster_name text NOT NULL DEFAULT 'مدير المدرسة',
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  steps.push("app_settings");

  /* ----------------------- classrooms ----------------------- */
  await runRaw(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id serial PRIMARY KEY,
      grade text NOT NULL,
      section text NOT NULL,
      stage text NOT NULL DEFAULT 'ابتدائي',
      user_id integer NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  // ترقية القواعد القديمة: إضافة عمود المعلم المالك ثم ربط الصفوف الحالية بأول حساب
  await runRaw(`ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS user_id integer`);
  await runRaw(
    `ALTER TABLE classrooms DROP CONSTRAINT IF EXISTS classrooms_user_id_fkey`,
  );
  await runRaw(
    `ALTER TABLE classrooms ADD CONSTRAINT classrooms_user_id_fkey
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
  );
  await runRaw(
    `UPDATE classrooms SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL`,
  );
  await runRaw(`ALTER TABLE classrooms ALTER COLUMN user_id SET NOT NULL`);
  await runRaw(`ALTER TABLE classrooms ALTER COLUMN user_id SET DEFAULT 1`);
  // اسمح لعدة معلمين بامتلاك فصل بنفس الصف والشعبة (كل معلم له نسخته)
  await runRaw(`DROP INDEX IF EXISTS classrooms_grade_section_unique`);
  await runRaw(
    `CREATE UNIQUE INDEX IF NOT EXISTS classrooms_grade_section_user_unique
     ON classrooms (grade, section, user_id)`,
  );
  steps.push("classrooms");

  /* ----------------------- students ----------------------- */
  await runRaw(`
    CREATE TABLE IF NOT EXISTS students (
      id serial PRIMARY KEY,
      full_name text NOT NULL,
      national_id text,
      classroom_id integer NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      class_number integer,
      notes text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await runRaw(
    `CREATE UNIQUE INDEX IF NOT EXISTS students_classroom_number_unique ON students (classroom_id, class_number)`,
  );
  steps.push("students");

  /* ----------------------- subjects ----------------------- */
  // كل مادة مرتبطة بفصل واحد فقط — لا تظهر لبقية الفصول
  await runRaw(`
    CREATE TABLE IF NOT EXISTS subjects (
      id serial PRIMARY KEY,
      name text NOT NULL,
      classroom_id integer NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      items jsonb NOT NULL DEFAULT '[]'::jsonb,
      total_max numeric(6,2) NOT NULL DEFAULT 100,
      passing_score numeric(6,2) NOT NULL DEFAULT 50,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await runRaw(`DROP INDEX IF EXISTS subjects_classroom_name_unique`);
  await runRaw(
    `CREATE UNIQUE INDEX IF NOT EXISTS subjects_classroom_name_unique ON subjects (classroom_id, name)`,
  );
  // ترقية الخانات المخزّنة لإضافة الفترة (فترتان لكل فصل دراسي)
  await runRaw(`
    UPDATE subjects SET items = (
      SELECT jsonb_agg(
        CASE WHEN elem ? 'period' THEN elem ELSE elem || '{"period":"p1"}'::jsonb END
        ORDER BY ord
      )
      FROM jsonb_array_elements(items) WITH ORDINALITY AS t(elem, ord)
    ) WHERE jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0`);
  steps.push("subjects");

  /* ----------------------- grades ----------------------- */
  // درجة مستقلة لكل فصل دراسي (فصلان رأسيان فقط)
  await runRaw(`
    CREATE TABLE IF NOT EXISTS grades (
      id serial PRIMARY KEY,
      student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id integer NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      semester text NOT NULL DEFAULT 'first',
      values jsonb NOT NULL DEFAULT '{}'::jsonb,
      total numeric(6,2) NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await runRaw(`ALTER TABLE grades ADD COLUMN IF NOT EXISTS semester text`);
  await runRaw(`UPDATE grades SET semester = 'first' WHERE semester IS NULL OR semester = ''`);
  await runRaw(`ALTER TABLE grades ALTER COLUMN semester SET NOT NULL`);
  await runRaw(`ALTER TABLE grades ALTER COLUMN semester SET DEFAULT 'first'`);
  await runRaw(`DROP INDEX IF EXISTS grades_student_subject_unique`);
  await runRaw(
    `CREATE UNIQUE INDEX IF NOT EXISTS grades_student_subject_semester_unique
     ON grades (student_id, subject_id, semester)`,
  );
  steps.push("grades");

  // توحيد قيم الفصل الدراسي إلى first / second فقط
  await runRaw(`
    UPDATE grades SET semester = CASE
      WHEN semester ILIKE '%ثان%' OR semester IN ('2', 's2') THEN 'second'
      ELSE 'first' END`);

  /* ---------------- بيانات البداية (Seeding) ---------------- */

  // لا يتم إنشاء أي حساب افتراضي ولا تُعرض أي كلمة مرور في أي مكان.
  // أول معلم يُسجّل حسابه من صفحة الدخول يصبح تلقائياً مدير النظام.
  const userCount = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM users`);
  const userCountValue = Number(userCount.rows?.[0]?.count ?? "0");
  if (userCountValue === 0) steps.push("awaiting-first-teacher");

  // 2) صف الإعدادات الافتراضية
  const settingsCount = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM app_settings`,
  );
  if (Number(settingsCount.rows?.[0]?.count ?? "0") === 0) {
    await db.execute(sql`INSERT INTO app_settings (id) VALUES (1)`);
    steps.push("seed:settings");
  }

  // 3) فصل + مادة نموذجية للتجربة السريعة
  const classroomCount = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM classrooms`,
  );
  if (Number(classroomCount.rows?.[0]?.count ?? "0") === 0) {
    const inserted = await db.execute<{ id: number }>(
      sql`INSERT INTO classrooms (grade, section, stage) VALUES (${"السادس"}, ${"أ"}, ${"ابتدائي"}) RETURNING id`,
    );
    const classroomId = inserted.rows?.[0]?.id;
    if (classroomId) {
      await db.execute(
        sql`INSERT INTO subjects (name, classroom_id, items, total_max, passing_score)
            VALUES (
              ${"الرياضيات"},
              ${classroomId},
              ${JSON.stringify([
                { id: "p1", label: "المهام الأدائية", max: 20, group: "year", kind: "performance" },
                { id: "p2", label: "المشاركة والتفاعل", max: 10, group: "year", kind: "participation" },
                { id: "p3", label: "الواجبات", max: 10, group: "year", kind: "homework" },
                { id: "p4", label: "الاختبارات القصيرة", max: 20, group: "year", kind: "quiz" },
                { id: "f1", label: "الاختبار النهائي التحريري", max: 40, group: "final", kind: "written" },
              ])}::jsonb,
              100, 50)`,
      );
    }
    steps.push("seed:sample-classroom");
  }

  return { steps, userCount: userCountValue, needsFirstAccount: userCountValue === 0 };
}
