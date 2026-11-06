/**
 * Builds per-student coverage and course-level gaps from envelope ops (pure).
 */

import type {
  ISlcDeltaOp,
  ISlcRunCoverage,
  ISlcStudentSyncCoverage,
  ISlcSyncCoverageGap,
} from '@scholaracle/contracts';

function courseExternalIdOf(op: ISlcDeltaOp): string | undefined {
  const fromKey = op.key?.courseExternalId?.trim();
  if (fromKey) return fromKey;
  const rec = op.record as Record<string, unknown> | undefined;
  const fromRecord = rec?.['courseExternalId'];
  return typeof fromRecord === 'string' && fromRecord.trim() ? fromRecord.trim() : undefined;
}

function studentIdOf(op: ISlcDeltaOp): string | undefined {
  const v = op.key?.studentExternalId;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function courseTitleFromRecord(record: Record<string, unknown> | undefined): string {
  const t = record?.['title'];
  return typeof t === 'string' && t.trim() ? t.trim() : '';
}

function normalizedEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim().toLowerCase();
  return s.length > 0 ? s : undefined;
}

export function computeRunCoverage(ops: readonly ISlcDeltaOp[]): ISlcRunCoverage {
  type StudentAgg = {
    courseIds: Set<string>;
    courseTitles: Map<string, string>;
    coursesWithGrade: Set<string>;
    assignmentCountByCourse: Map<string, number>;
    attendanceRows: number;
    teacherEmails: Set<string>;
  };

  const byStudent = new Map<string, StudentAgg>();

  function getAgg(studentExternalId: string): StudentAgg {
    let a = byStudent.get(studentExternalId);
    if (!a) {
      a = {
        courseIds: new Set(),
        courseTitles: new Map(),
        coursesWithGrade: new Set(),
        assignmentCountByCourse: new Map(),
        attendanceRows: 0,
        teacherEmails: new Set(),
      };
      byStudent.set(studentExternalId, a);
    }
    return a;
  }

  for (const op of ops) {
    if (op.op !== 'upsert') continue;
    const sid = studentIdOf(op);
    if (!sid) continue;

    const agg = getAgg(sid);

    if (op.entity === 'course') {
      const cid = op.key.externalId.trim();
      agg.courseIds.add(cid);
      const title = courseTitleFromRecord(op.record as Record<string, unknown> | undefined);
      if (title) agg.courseTitles.set(cid, title);
      const rec = op.record as Record<string, unknown> | undefined;
      const em = normalizedEmail(rec?.['teacherEmail']);
      if (em) agg.teacherEmails.add(em);
    }

    if (op.entity === 'gradeSnapshot') {
      const cid = courseExternalIdOf(op);
      if (cid) agg.coursesWithGrade.add(cid);
    }

    if (op.entity === 'assignment') {
      const cid = courseExternalIdOf(op);
      if (cid) {
        agg.assignmentCountByCourse.set(cid, (agg.assignmentCountByCourse.get(cid) ?? 0) + 1);
      }
    }

    if (op.entity === 'attendanceEvent') {
      agg.attendanceRows += 1;
    }

    if (op.entity === 'teacher') {
      const rec = op.record as Record<string, unknown> | undefined;
      const em = normalizedEmail(rec?.['email']);
      if (em) agg.teacherEmails.add(em);
    }
  }

  const students: ISlcStudentSyncCoverage[] = [];

  for (const [studentExternalId, agg] of byStudent) {
    const gaps: ISlcSyncCoverageGap[] = [];

    for (const courseId of agg.courseIds) {
      const hasGrade = agg.coursesWithGrade.has(courseId);
      const assignN = agg.assignmentCountByCourse.get(courseId) ?? 0;
      const title = agg.courseTitles.get(courseId) ?? '';
      const courseLabel = title || courseId;

      if (!hasGrade && assignN === 0) {
        gaps.push({ course: courseLabel, kind: 'no_grade_no_assignments' });
      } else if (!hasGrade) {
        gaps.push({ course: courseLabel, kind: 'no_grade' });
      } else if (assignN === 0) {
        gaps.push({ course: courseLabel, kind: 'no_assignments' });
      }
    }

    const coursesWithAssignments = [...agg.courseIds].filter(
      (cid) => (agg.assignmentCountByCourse.get(cid) ?? 0) > 0
    ).length;

    students.push({
      studentExternalId,
      courses: agg.courseIds.size,
      coursesWithGrade: agg.coursesWithGrade.size,
      coursesWithAssignments,
      attendanceRows: agg.attendanceRows,
      teacherEmails: agg.teacherEmails.size,
      gaps,
    });
  }

  students.sort((a, b) => a.studentExternalId.localeCompare(b.studentExternalId));

  return { students };
}
