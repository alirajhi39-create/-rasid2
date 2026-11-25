import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { ensureDatabase } from "@/lib/bootstrap";
import { ownsClassroom } from "@/lib/ownership";
import { normalizeItems, round2, thresholdsFrom, toPeriod } from "@/lib/grades";
import { SEMESTER_SHORT, GRADE_LABEL_PREFIX } from "@/lib/constants";
import type { GradeValues, ScoreItem } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubjectRow = {
  id: number;
  name: string;
  items: ScoreItem[];
  total_max: string;
  passing_score: string;
};

type StudentRow = { id: number; full_name: string; class_number: number | null };

type GradeRow = {
  student_id: number;
  subject_id: number;
  semester: string;
  values: GradeValues | null;
  total: string | null;
};

/* حدود مستويات الأداء (مرحلة تأسيسية) */
const LEVELS = [
  { key: "exceptional", label: "متقناً جداً / متفوق", min: 90, color: "emerald" },
  { key: "mastery", label: "متقناً", min: 75, color: "sky" },
  { key: "followup", label: "بحاجة إلى متابعة", min: 50, color: "amber" },
  { key: "support", label: "بحاجة إلى دعم / خطة علاجية", min: 0, color: "rose" },
] as const;

const MASTERY_PCT = 75; // نسبة الإتقان
const PASS_PCT = 50; // نسبة الاجتياز

/**
 * GET /api/analytics?classroomId=1&semester=first&mode=semester|year
 *
 * تحليل تربوي شامل لمرحلة التعليم الأساسي:
 *  - نسبة الإتقان + نسبة الاجتياز (≥ ٥٠٪)
 *  - توزيع مستويات الأداء بأعدادها ونسبها
 *  - تحليل المهارات (البنود) والفاقد التعليمي
 *  - مقارنة المواد والفصول والشعب
 *  - مقارنة الفترة الحالية بالسابقة
 *  - مخرجات عملية: خطط علاجية وإثرائية وتغذية راجعة وتعديل التدريس
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  await ensureDatabase();

  const url = new URL(request.url);
  const classroomId = Number(url.searchParams.get("classroomId"));
  const semester = url.searchParams.get("semester") === "second" ? "second" : "first";
  const mode: "semester" | "year" = url.searchParams.get("mode") === "year" ? "year" : "semester";

  if (!Number.isFinite(classroomId) || classroomId <= 0) {
    return NextResponse.json({ ok: false, error: "الرجاء تحديد الفصل" }, { status: 400 });
  }
  if (!(await ownsClassroom(classroomId, guard.session.uid))) {
    return NextResponse.json(
      { ok: false, error: "غير مصرح — هذا الفصل ليس من فصولك" },
      { status: 403 },
    );
  }

  try {
    const uid = guard.session.uid;
    const classResult = await db.execute<{ grade: string; section: string; stage: string }>(
      sql`SELECT grade, section, stage FROM classrooms WHERE id = ${classroomId} LIMIT 1`,
    );
    const classroom = classResult.rows?.[0];
    if (!classroom) {
      return NextResponse.json({ ok: false, error: "الفصل غير موجود" }, { status: 404 });
    }

    const subjectsResult = await db.execute<SubjectRow>(sql`
      SELECT id, name, items, total_max, passing_score
      FROM subjects WHERE classroom_id = ${classroomId} AND user_id = ${uid} ORDER BY name
    `);
    const subjects = (subjectsResult.rows ?? []).map((s) => ({
      ...s,
      items: normalizeItems(s.items ?? []),
      totalMax: Number(s.total_max),
      passingScore: Number(s.passing_score),
    }));

    const studentsResult = await db.execute<StudentRow>(sql`
      SELECT id, full_name, class_number FROM students
      WHERE classroom_id = ${classroomId} AND active = true
      ORDER BY COALESCE(class_number, 999999), full_name
    `);
    const students = studentsResult.rows ?? [];

    const semesterFilter =
      mode === "year" ? sql`g.semester IN ('first', 'second')` : sql`g.semester = ${semester}`;
    const gradesResult = await db.execute<GradeRow>(sql`
      SELECT g.student_id, g.subject_id, g.semester, g.values, g.total
      FROM grades g JOIN subjects s ON s.id = g.subject_id
      WHERE ${semesterFilter} AND s.classroom_id = ${classroomId} AND s.user_id = ${uid}
    `);

    const maxMultiplier = mode === "year" ? 2 : 1;
    // دمج درجات الفصلين في وضع العام
    const gradeMap = new Map<string, { values: GradeValues; total: number }>();
    for (const g of gradesResult.rows ?? []) {
      const key = `${g.student_id}:${g.subject_id}`;
      const total = Number(g.total ?? 0);
      const ex = gradeMap.get(key);
      if (ex) ex.total = round2(ex.total + total);
      else gradeMap.set(key, { values: (g.values ?? {}) as GradeValues, total });
    }

    const settingsResult = await db.execute<{
      pct_excellent: number;
      pct_vgood: number;
      pct_good: number;
      pct_pass: number;
    }>(
      sql`SELECT pct_excellent, pct_vgood, pct_good, pct_pass
          FROM app_settings WHERE id = 1 LIMIT 1`,
    );
    const s0 = settingsResult.rows?.[0];
    const th = thresholdsFrom({
      pctExcellent: s0?.pct_excellent,
      pctVgood: s0?.pct_vgood,
      pctGood: s0?.pct_good,
      pctPass: s0?.pct_pass,
    });

    /* ================= ١) تحليل الطلاب ================= */
    const studentAnalysis = students.map((st) => {
      const pairs = subjects.map((subject) => ({
        totalMax: round2(subject.totalMax * maxMultiplier),
        total: gradeMap.get(`${st.id}:${subject.id}`)?.total ?? 0,
        passingScore: round2(subject.passingScore * maxMultiplier),
      }));
      const graded = pairs.filter((p) => p.total > 0);
      const total = graded.reduce((sum, p) => sum + p.total, 0);
      const maxPossible = graded.reduce((sum, p) => sum + p.totalMax, 0);
      const avg = graded.length ? round2(total / graded.length) : 0;
      const passed = graded.filter((p) => p.total >= p.passingScore).length;
      return {
        id: st.id,
        name: st.full_name,
        classNumber: st.class_number,
        gradedCount: graded.length,
        total: round2(total),
        avg,
        pct: maxPossible > 0 ? round2((total / maxPossible) * 100) : 0,
        passedCount: passed,
        failedCount: graded.length - passed,
      };
    });

    const gradedStudents = studentAnalysis.filter((s) => s.gradedCount > 0);

    /* ============ ٢) نسبة الإتقان ونسبة الاجتياز (≥ ٥٠٪) ============ */
    const mastered = gradedStudents.filter((s) => s.pct >= MASTERY_PCT).length;
    const achieved = gradedStudents.filter((s) => s.pct >= PASS_PCT).length;
    const masteryRate = gradedStudents.length ? round2((mastered / gradedStudents.length) * 100) : 0;
    const passRate = gradedStudents.length ? round2((achieved / gradedStudents.length) * 100) : 0;

    /* ============ ٣) توزيع مستويات الأداء ============ */
    const levels = LEVELS.map((lv) => {
      const count =
        lv.key === "exceptional"
          ? gradedStudents.filter((s) => s.pct >= 90).length
          : lv.key === "mastery"
            ? gradedStudents.filter((s) => s.pct >= 75 && s.pct < 90).length
            : lv.key === "followup"
              ? gradedStudents.filter((s) => s.pct >= 50 && s.pct < 75).length
              : gradedStudents.filter((s) => s.pct < 50).length;
      return {
        key: lv.key,
        label: lv.label,
        color: lv.color,
        count,
        pct: gradedStudents.length ? round2((count / gradedStudents.length) * 100) : 0,
      };
    });

    /* ============ ٤) تحليل المهارات (البنود) والفاقد التعليمي ============ */
    const skillRows: {
      subject: string;
      label: string;
      group: string;
      max: number;
      avgPct: number;
      masteryRate: number;
      struggleCount: number;
      gradedCount: number;
      period: string;
    }[] = [];

    for (const subject of subjects) {
      for (const item of subject.items) {
        const values: number[] = [];
        for (const st of students) {
          const entry = gradeMap.get(`${st.id}:${subject.id}`);
          if (!entry) continue;
          const v = entry.values[item.id];
          if (typeof v === "number" && v > 0) values.push(v);
        }
        if (values.length === 0) continue;
        const max = Math.max(1, item.max);
        const avgValue = round2(values.reduce((a, b) => a + b, 0) / values.length);
        const avgPct = round2((avgValue / max) * 100);
        const mastery = values.filter((v) => (v / max) * 100 >= MASTERY_PCT).length;
        const struggle = values.filter((v) => (v / max) * 100 < PASS_PCT).length;
        skillRows.push({
          subject: subject.name,
          label: item.label,
          group: item.group,
          max: item.max,
          avgPct,
          masteryRate: round2((mastery / values.length) * 100),
          struggleCount: struggle,
          gradedCount: values.length,
          period: toPeriod(item.period) === "p1" ? "الأولى" : "الثانية",
        });
      }
    }
    const skills = skillRows.sort((a, b) => b.struggleCount - a.struggleCount || a.avgPct - b.avgPct);
    const criticalSkills = skills.filter(
      (s) => s.struggleCount > 0 && s.struggleCount >= Math.ceil(s.gradedCount * 0.5),
    );
    const strongSkills = skills.filter((s) => s.masteryRate >= 80).slice(0, 6);

    /* ============ ٥) مقارنة المواد ============ */
    const subjectAnalysis = subjects.map((subject) => {
      const entries = students
        .map((st) => ({ name: st.full_name, total: gradeMap.get(`${st.id}:${subject.id}`)?.total ?? 0 }))
        .filter((e) => e.total > 0);
      const totals = entries.map((e) => e.total);
      const effectiveMax = round2(subject.totalMax * maxMultiplier);
      const avg = totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
      const passed = totals.filter((t) => t >= round2(subject.passingScore * maxMultiplier)).length;
      const sorted = [...entries].sort((a, b) => b.total - a.total);
      return {
        id: subject.id,
        name: subject.name,
        totalMax: effectiveMax,
        passingScore: round2(subject.passingScore * maxMultiplier),
        gradedCount: entries.length,
        avg,
        pct: effectiveMax > 0 ? round2((avg / effectiveMax) * 100) : 0,
        masteryRate: totals.length
          ? round2((totals.filter((t) => (t / effectiveMax) * 100 >= MASTERY_PCT).length / totals.length) * 100)
          : 0,
        passed,
        failed: entries.length - passed,
        passRate: entries.length ? round2((passed / entries.length) * 100) : 0,
        highest: totals.length ? Math.max(...totals) : 0,
        lowest: totals.length ? Math.min(...totals) : 0,
        top: sorted.slice(0, 3),
        bottom: sorted.slice(-3).reverse(),
      };
    });

    /* ============ ٦) مقارنة الفصول والشعب ============ */
    const classesResult = await db.execute<{
      id: number;
      grade: string;
      section: string;
      stage: string;
    }>(sql`SELECT id, grade, section, stage FROM classrooms WHERE user_id = ${uid} ORDER BY id`);
    const allClasses = classesResult.rows ?? [];
    const allClassIds = allClasses.map((c) => c.id);
    // نمرّر معرّفات الفصول مربوطة يدوياً (ANY(مصفوفة) لا يدعمها driver)
    const classIdList = sql.join(allClassIds.map((id) => sql`${id}`), sql`, `);
    const crossGrades = allClassIds.length
      ? await db.execute<{ student_id: number; subject_id: number; total: string; cid: number }>(sql`
          SELECT g.student_id, g.subject_id, g.total, c.id AS cid
          FROM grades g
          JOIN subjects s ON s.id = g.subject_id
          JOIN classrooms c ON c.id = s.classroom_id
          WHERE ${semesterFilter} AND c.user_id = ${uid} AND c.id IN (${classIdList})
        `)
      : { rows: [] as [] };

    const classSubjectMax = new Map<number, number>();
    for (const c of allClasses) {
      const subs = await db.execute<{ total_max: string }>(
        sql`SELECT total_max FROM subjects WHERE classroom_id = ${c.id} AND user_id = ${uid}`,
      );
      classSubjectMax.set(
        c.id,
        round2((subs.rows ?? []).reduce((s, x) => s + Number(x.total_max), 0) * maxMultiplier),
      );
    }

    const crossRows = (crossGrades as { rows?: unknown[] }).rows ?? [];
    const classMap = new Map<number, Map<number, { sum: number; cnt: number }>>();
    for (const row of crossRows as {
      student_id: number;
      subject_id: number;
      total: string;
      cid: number;
    }[]) {
      if (!classMap.has(row.cid)) classMap.set(row.cid, new Map());
      const m = classMap.get(row.cid)!;
      const cur = m.get(row.student_id) ?? { sum: 0, cnt: 0 };
      cur.sum += Number(row.total ?? 0);
      cur.cnt += 1;
      m.set(row.student_id, cur);
    }

    const classComparison = allClasses.map((c) => {
      const m = classMap.get(c.id) ?? new Map<number, { sum: number; cnt: number }>();
      const avgs = [...m.values()]
        .filter((v) => v.cnt > 0)
        .map((v) => v.sum / v.cnt);
      // نحسب النسبة من مجموع عظمى المواد
      const totals = [...m.values()].filter((v) => v.cnt > 0);
      const sumAll = totals.reduce((s, v) => s + v.sum, 0);
      const maxAll = classSubjectMax.get(c.id) ?? 0;
      return {
        id: c.id,
        grade: c.grade,
        section: c.section,
        stage: c.stage,
        studentsCount: m.size,
        avg: avgs.length ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0,
        pct: maxAll > 0 && sumAll > 0 ? round2((sumAll / (m.size * maxAll)) * 100) : 0,
        current: c.id === classroomId,
      };
    });

    /* ============ ٧) مقارنة الفترة الحالية بالسابقة ============ */
    const otherSemester = semester === "first" ? "second" : "first";
    const prevResult = await db.execute<{ total: string; student_id: number; subject_id: number }>(sql`
      SELECT g.total, g.student_id, g.subject_id
      FROM grades g JOIN subjects s ON s.id = g.subject_id
      WHERE g.semester = ${otherSemester}
        AND s.classroom_id = ${classroomId} AND s.user_id = ${uid}
    `);
    const prevMap = new Map<string, number>();
    for (const r of prevResult.rows ?? []) {
      prevMap.set(`${r.student_id}:${r.subject_id}`, Number(r.total ?? 0));
    }

    const studentTrend = gradedStudents.map((st) => {
      const cur = subjects
        .map((sub) => gradeMap.get(`${st.id}:${sub.id}`)?.total ?? 0)
        .filter((t) => t > 0);
      const prev = subjects
        .map((sub) => prevMap.get(`${st.id}:${sub.id}`) ?? 0)
        .filter((t) => t > 0);
      const curAvg = cur.length ? round2(cur.reduce((a, b) => a + b, 0) / cur.length) : 0;
      const prevAvg = prev.length ? round2(prev.reduce((a, b) => a + b, 0) / prev.length) : 0;
      const delta = prev.length ? round2(curAvg - prevAvg) : 0;
      return {
        id: st.id,
        name: st.name,
        current: curAvg,
        previous: prevAvg,
        delta,
        direction: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat",
      };
    });

    const trend = {
      comparedCount: studentTrend.filter((s) => s.previous > 0).length,
      improved: studentTrend.filter((s) => s.direction === "up").length,
      declined: studentTrend.filter((s) => s.direction === "down").length,
      stable: studentTrend.filter((s) => s.direction === "flat").length,
      previousSemester: SEMESTER_SHORT[otherSemester as "first" | "second"] ?? otherSemester,
      students: studentTrend,
      classCurrentPct: 0,
      classPreviousPct: 0,
      deltaPct: 0,
    };

    /* ============ ٨) المخرجات العملية ============ */
    const remedial = gradedStudents
      .filter((s) => s.pct < PASS_PCT)
      .sort((a, b) => a.pct - b.pct)
      .map((s) => ({
        id: s.id,
        name: s.name,
        pct: s.pct,
        weakest: skills.slice(0, 3).map((k) => k.label),
        action: `أنشطة مبسّطة ووراق عمل مركّزة على «${skills[0]?.label ?? "المهارات الأساسية"}» + متابعة فردية يومية لمدة أسبوعين، وإعادة تقويم قصير.`,
      }));

    const enrichment = gradedStudents
      .filter((s) => s.pct >= 90)
      .sort((a, b) => b.pct - a.pct)
      .map((s) => ({
        id: s.id,
        name: s.name,
        pct: s.pct,
        action: "مهام إثرائية ومشاريع تفكير أعلى + قيادة أنشطة التعلم التعاوني وتصميم أسئلة تحدي.",
      }));

    const familyFeedback = gradedStudents
      .filter((s) => s.pct < 75)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        name: s.name,
        pct: s.pct,
        message: `نقطة القوة: ${strongSkills[0]?.label ?? "الالتزام العام"}. يحتاج في المنزل: التدرّب اليومي على «${skills[0]?.label ?? "المهارات الأساسية"}» لمدة ١٥ دقيقة، ومتابعة الواجبات أسبوعياً.`,
      }));

    const teachingAdjustments = criticalSkills.map((k) => ({
      skill: k.label,
      subject: k.subject,
      struggleCount: k.struggleCount,
      gradedCount: k.gradedCount,
      struggleRate: k.gradedCount ? round2((k.struggleCount / k.gradedCount) * 100) : 0,
      recommendation:
        "تعثر جماعي في مهارة تأسيسية — يُنصح بـ: إعادة الشرح بوسائل محسوسة، تقسيم المهارة إلى خطوات صغيرة، تنويع أدوات التقويم التكويني، وتدريس نمطي (نموذج / تطبيق موجّه / حر).",
    }));

    /* ============ ٩) الملخص ============ */
    const totalAchieved = [...gradeMap.values()].reduce((s, g) => s + g.total, 0);
    const totalPossible = [...gradeMap.keys()].reduce((sum, key) => {
      const sid = Number(key.split(":")[1]);
      const sub = subjects.find((x) => x.id === sid);
      return sum + (sub ? sub.totalMax * maxMultiplier : 0);
    }, 0);

    const byAvg = [...studentAnalysis].sort((a, b) => b.avg - a.avg);
    const classAvg = gradedStudents.length
      ? round2(gradedStudents.reduce((a, b) => a + b.avg, 0) / gradedStudents.length)
      : 0;

    return NextResponse.json({
      ok: true,
      mode,
      semester,
      semesterLabel:
        mode === "year"
          ? "نهاية العام الدراسي"
          : (SEMESTER_SHORT[semester as "first" | "second"] ?? ""),
      thresholds: th,
      classroom: {
        id: classroomId,
        grade: classroom.grade,
        section: classroom.section,
        stage: classroom.stage,
      },
      mastery: {
        masteryPct: MASTERY_PCT,
        passPct: PASS_PCT,
        masteryRate,
        passRate,
        masteredCount: mastered,
        achievedCount: achieved,
        gradedCount: gradedStudents.length,
      },
      levels,
      skills,
      criticalSkills,
      strongSkills,
      subjects: subjectAnalysis,
      classes: classComparison,
      trend,
      actions: { remedial, enrichment, familyFeedback, teachingAdjustments },
      students: studentAnalysis,
      top: byAvg.slice(0, 5),
      bottom: byAvg.filter((s) => s.avg > 0).slice(-5).reverse(),
      ratingCounts: levels.reduce(
        (acc, l) => ({ ...acc, [l.label]: l.count }),
        {} as Record<string, number>,
      ),
      gradedEntries: gradeMap.size,
      summary: {
        studentsCount: students.length,
        subjectsCount: subjects.length,
        gradedEntries: gradeMap.size,
        gradedStudents: gradedStudents.length,
        classAvg,
        classPct: totalPossible > 0 ? round2((totalAchieved / totalPossible) * 100) : 0,
        totalAchieved: round2(totalAchieved),
        totalPossible: round2(totalPossible),
        completionRate:
          students.length * subjects.length > 0
            ? round2((gradeMap.size / (students.length * subjects.length)) * 100)
            : 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "تعذر تحليل النتائج",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
