import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ============================================================
 * أنواع مساعدة (مشاركة بين الواجهة والخادم)
 * ========================================================== */

export type ScoreItemKind =
  | "performance"
  | "participation"
  | "homework"
  | "quiz"
  | "written"
  | "practical"
  | "oral"
  | "custom";

/**
 * مجموعة التقييم:
 *  - performance : المهام الأدائية (٤٠)
 *  - written     : التقويمات التحريرية (٦٠)
 *  - oral        : التقويمات التحريرية والشفوية (اختيارية — بلا هدف ثابت)
 */
export type ScoreGroup = "performance" | "written" | "oral";

/** فترة التقييم داخل الفصل الدراسي (فترتان لكل فصل) */
export type ScorePeriod = "p1" | "p2";

/** الفصل الدراسي الرأسي (فصلان فقط في العام) */
export type Semester = "first" | "second";

export type ScoreItem = {
  id: string;
  label: string;
  max: number;
  group: ScoreGroup;
  kind: ScoreItemKind;
  period: ScorePeriod;
};

export type GradeValues = Record<string, number | null>;

/* ============================================================
 * جدول المستخدمين (المعلمين)
 * ========================================================== */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    /** البريد الإلكتروني — يُستخدم لاستعادة كلمة المرور */
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull().default("معلم المادة"),
    role: text("role").notNull().default("teacher"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

/* ============================================================
 * إعدادات التطبيق (صف واحد فقط)
 * ========================================================== */

export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  schoolName: text("school_name").notNull().default("مدرسة الأمير عبدالله بن عبدالعزيز"),
  administration: text("administration").notNull().default("إدارة التعليم - منطقة الرياض"),
  ministryOffice: text("ministry_office").notNull().default("وزارة التعليم"),
  teacherName: text("teacher_name").notNull().default("معلم المادة"),
  academicYear: text("academic_year").notNull().default("1447 هـ"),
  semester: text("semester").notNull().default("الفصل الدراسي الأول"),
  headmasterName: text("headmaster_name").notNull().default("مدير المدرسة"),
  /* حدود النِّسب المئوية للتقديرات — قابلة للتعديل من الإعدادات */
  pctExcellent: integer("pct_excellent").notNull().default(90),
  pctVgood: integer("pct_vgood").notNull().default(80),
  pctGood: integer("pct_good").notNull().default(65),
  pctPass: integer("pct_pass").notNull().default(50),
  /* توقيعات مرفوعة كصور (base64) — تظهر في التقارير المطبوعة */
  teacherSignature: text("teacher_signature"),
  headmasterSignature: text("headmaster_signature"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
 * الفصول الدراسية (الصف + الشعبة) — مرتبطة بمعلم واحد
 * ========================================================== */

export const classrooms = pgTable(
  "classrooms",
  {
    id: serial("id").primaryKey(),
    grade: text("grade").notNull(),
    section: text("section").notNull(),
    stage: text("stage").notNull().default("ابتدائي"),
    /** المعلم المالك للفصل — يضمن عزل بيانات كل معلم */
    userId: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("classrooms_grade_section_user_unique").on(table.grade, table.section, table.userId)],
);

/* ============================================================
 * الطلاب
 * ========================================================== */

export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    nationalId: text("national_id"),
    classroomId: integer("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    classNumber: integer("class_number"),
    /** رقم واتساب ولي الأمر (لإرسال نتيجة الطالب) */
    guardianPhone: text("guardian_phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("students_classroom_number_unique").on(table.classroomId, table.classNumber)],
);

/* ============================================================
 * المواد الدراسية + توزيع الدرجات
 *  كل مادة مرتبطة بفصل دراسي واحد (classroom_id) ولا تظهر لغيره
 * ========================================================== */

/**
 * المادة: يمكن ربطها بفصل دراسي واحد أو تركها غير مرتبطة (classroomId = null).
 * الملكية محفوظة في userId حتى تبقى المادة تحت حساب المعلم بعد فك الربط.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    classroomId: integer("classroom_id").references(() => classrooms.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .default(1)
      .references(() => users.id, { onDelete: "cascade" }),
    items: jsonb("items").$type<ScoreItem[]>().notNull().default([]),
    totalMax: numeric("total_max", { precision: 6, scale: 2 }).notNull().default("100"),
    passingScore: numeric("passing_score", { precision: 6, scale: 2 }).notNull().default("50"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("subjects_classroom_name_unique").on(table.classroomId, table.name)],
);

/* ============================================================
 * الدرجات المُرصودة — لكل (طالب × مادة × فصل دراسي)
 * ========================================================== */

export const grades = pgTable(
  "grades",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    /** الفصل الدراسي: first | second */
    semester: text("semester").notNull().default("first"),
    values: jsonb("values").$type<GradeValues>().notNull().default({}),
    total: numeric("total", { precision: 6, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("grades_student_subject_semester_unique").on(
      table.studentId,
      table.subjectId,
      table.semester,
    ),
  ],
);

/* ============================================================
 * أنواع جاهزة للاستخدام في الكود
 * ========================================================== */

export type User = typeof users.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Classroom = typeof classrooms.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Grade = typeof grades.$inferSelect;
