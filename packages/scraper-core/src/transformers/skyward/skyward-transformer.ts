import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type {
  ISkywardFullExtract,
  ISkywardScheduleEntry,
} from '../../extractors/skyward/skyward-extractors';
import { parseTutorialWindow } from '../parseTutorialWindow';

// ---------------------------------------------------------------------------
// Skyward exposes no grading-period dates on the gradebook page, so no academicTerm
// ops are emitted and nothing carries a termExternalId. (A hard-coded district
// calendar used to live here; it went stale after one school year and hid courses.)

/** Returns term externalId for the grading period that contains the given date (YYYY-MM-DD). */

// Types imported from extractors module (single source of truth)

// ---------------------------------------------------------------------------
// Transform: ISkywardFullExtract -> ISlcDeltaOp[]
// ---------------------------------------------------------------------------

export interface ITransformContext {
  provider: string;
  adapterId: string;
  studentExternalId: string;
  institutionExternalId: string;
}

function parseGradePercent(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([\d.]+)\s*%/);
  if (m) return parseFloat(m[1]!);
  const m2 = text.match(/^([\d.]+)$/);
  return m2 ? parseFloat(m2[1]!) : undefined;
}

function parseLetterGrade(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(/([A-F][+-]?)/i);
  return m ? m[1]! : undefined;
}

function parseTimeRange(time: string): { startTime?: string; endTime?: string } {
  if (!time) return {};
  const m = time.match(/(\d+:\d+\s*[AP]M)\s*-\s*(\d+:\d+\s*[AP]M)/i);
  if (m) return { startTime: m[1]!.trim(), endTime: m[2]!.trim() };
  return {};
}

function resolveTutorialWindow(...sources: (string | undefined)[]): string | undefined {
  for (const source of sources) {
    const parsed = parseTutorialWindow(source);
    if (parsed) return parsed;
  }
  return undefined;
}

function normalizeAttendanceStatus(
  raw: string
): 'present' | 'absent' | 'tardy' | 'excused' | 'unexcused' | 'partial' | 'field_trip' {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('present') || lower.includes('here')) return 'present';
  if (lower.includes('absent')) return lower.includes('excus') ? 'excused' : 'absent';
  if (lower.includes('tardy') || lower.includes('late')) return 'tardy';
  if (lower.includes('excus')) return 'excused';
  if (lower.includes('partial')) return 'partial';
  if (lower.includes('field') || lower.includes('trip')) return 'field_trip';
  return 'absent';
}

function parseDate(dateStr: string): string {
  if (!dateStr) return '';
  // "Wed Jan 7, 2026" -> "2026-01-07"
  const m = dateStr.match(/([A-Z][a-z]{2})\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (m) {
    const months: Record<string, string> = {
      Jan: '01',
      Feb: '02',
      Mar: '03',
      Apr: '04',
      May: '05',
      Jun: '06',
      Jul: '07',
      Aug: '08',
      Sep: '09',
      Oct: '10',
      Nov: '11',
      Dec: '12',
    };
    const mon = months[m[2]!] ?? '01';
    const day = m[3]!.padStart(2, '0');
    return `${m[4]}-${mon}-${day}`;
  }
  // "02/15/2026" or "02/15/26" -> "2026-02-15"
  const m2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (m2) {
    const year = m2[3]!.length === 2 ? `20${m2[3]}` : m2[3]!;
    return `${year}-${m2[1]!.padStart(2, '0')}-${m2[2]!.padStart(2, '0')}`;
  }
  return dateStr;
}

function slugify(s: string): string {
  return (
    s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase() || 'unknown'
  );
}

export function transformSkywardExtract(
  extract: ISkywardFullExtract,
  ctx: ITransformContext
): ISlcDeltaOp[] {
  const ops: ISlcDeltaOp[] = [];
  const now = extract.timestamp || new Date().toISOString();
  const asOfDate = now.split('T')[0]!;

  const baseKey = {
    provider: ctx.provider,
    adapterId: ctx.adapterId,
    studentExternalId: ctx.studentExternalId,
    institutionExternalId: ctx.institutionExternalId,
  };

  // Academic terms (grading periods + semesters) for missing-assignment expiration

  // Student profile (student + school)
  if (extract.student && extract.student !== 'Unknown') {
    ops.push({
      op: 'upsert',
      entity: 'studentProfile',
      key: { ...baseKey, externalId: `skyward-profile-${ctx.studentExternalId}` },
      observedAt: now,
      record: {
        name: extract.student,
        school: extract.school || undefined,
      },
    });
  }

  // Build schedule lookup by period for room/time enrichment
  const scheduleByPeriod = new Map<string, ISkywardScheduleEntry>();
  for (const s of extract.schedule) {
    if (s.period) scheduleByPeriod.set(s.period, s);
  }

  // Helper: stable course externalId — prefer native _cni, fallback to period+slug
  const courseExtIdFor = (period: string, name: string, cni?: string): string =>
    cni ? `skyward-course-${cni}` : `skyward-course-${period}-${slugify(name)}`;

  // Courses + grade snapshots (from gradebook)
  for (let i = 0; i < extract.courses.length; i++) {
    const course = extract.courses[i]!;
    const courseExtId = courseExtIdFor(course.period, course.name, course._cni);
    const sched = scheduleByPeriod.get(course.period);
    const { startTime, endTime } = parseTimeRange(sched?.time || course.time);
    const tutorialWindow = resolveTutorialWindow(course.tutorialWindow, sched?.tutorialWindow);

    ops.push({
      op: 'upsert',
      entity: 'course',
      key: { ...baseKey, externalId: courseExtId },
      observedAt: now,
      record: {
        title: course.name,
        teacherName: course.teacher || undefined,
        period: course.period || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        room: sched?.room || undefined,
        tutorialWindow: tutorialWindow || undefined,
      },
    });

    // Grade snapshot per course (using grades Record / currentGrade)
    if (course.currentGrade || Object.keys(course.grades).length > 0) {
      const gradeVal = course.currentGrade || Object.values(course.grades).pop();
      ops.push({
        op: 'upsert',
        entity: 'gradeSnapshot',
        key: {
          ...baseKey,
          externalId: `skyward-grade-${course._cni ?? `${course.period}-${slugify(course.name)}`}`,
          courseExternalId: courseExtId,
        },
        observedAt: now,
        record: {
          courseExternalId: courseExtId,
          asOfDate,
          percentGrade: parseGradePercent(gradeVal),
          letterGrade:
            parseLetterGrade(gradeVal) ||
            (gradeVal && !/^\d+(\.\d+)?$/.test(gradeVal) ? gradeVal : undefined),
          sourceType: 'sis' as const,
        },
      });
    }
  }

  // Schedule entries that don't match gradebook courses -> create course
  for (const s of extract.schedule) {
    const courseExtId = `skyward-course-${s.period}-${slugify(s.course)}`;
    const exists = extract.courses.some(
      (c) => c.period === s.period && slugify(c.name) === slugify(s.course)
    );
    if (!exists && s.course) {
      const { startTime, endTime } = parseTimeRange(s.time);
      ops.push({
        op: 'upsert',
        entity: 'course',
        key: { ...baseKey, externalId: courseExtId },
        observedAt: now,
        record: {
          title: s.course,
          teacherName: s.teacher || undefined,
          period: s.period || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          room: s.room || undefined,
        },
      });
    }
  }

  // Teacher ops from schedule (deduplicated by name)
  const seenTeachers = new Map<string, { teacher: string; courseExtIds: string[] }>();
  for (const s of extract.schedule) {
    if (!s.teacher) continue;
    const matchingCourse = extract.courses.find((c) => c.period === s.period);
    const extId = matchingCourse
      ? courseExtIdFor(matchingCourse.period, matchingCourse.name, matchingCourse._cni)
      : `skyward-course-${s.period}-${slugify(s.course)}`;

    const existing = seenTeachers.get(s.teacher);
    if (existing) {
      existing.courseExtIds.push(extId);
    } else {
      seenTeachers.set(s.teacher, { teacher: s.teacher, courseExtIds: [extId] });
    }
  }
  for (const [, { teacher, courseExtIds }] of seenTeachers) {
    ops.push({
      op: 'upsert',
      entity: 'teacher',
      key: { ...baseKey, externalId: `skyward-teacher-${slugify(teacher)}` },
      observedAt: now,
      record: {
        name: teacher,
        courseExternalIds: courseExtIds,
      },
    });
  }

  // Missing assignments -> assignment (status: missing); set termExternalId for expiration
  for (let i = 0; i < extract.missingAssignments.length; i++) {
    const ma = extract.missingAssignments[i]!;
    const course = extract.courses.find((c) => c.name === ma.course || c.period === ma.period);
    const courseExtId = course
      ? courseExtIdFor(course.period, course.name, course._cni)
      : `skyward-course-${ma.period}-${slugify(ma.course)}`;
    const dueDateIso = ma.dueDate ? parseDate(ma.dueDate) : undefined;

    ops.push({
      op: 'upsert',
      entity: 'assignment',
      key: {
        ...baseKey,
        externalId: `skyward-missing-${slugify(ma.title)}-${ma.period}-${dueDateIso ?? 'nodate'}`,
        courseExternalId: courseExtId,
      },
      observedAt: now,
      record: {
        title: ma.title,
        dueAt: dueDateIso,
        status: 'missing' as const,
        courseExternalId: courseExtId,
      },
    });
  }

  // Graded/submitted assignments (from per-course gradebook detail)
  for (let i = 0; i < extract.assignments.length; i++) {
    const a = extract.assignments[i]!;
    const course = extract.courses.find(
      (c) => c.period === a.period || slugify(c.name) === slugify(a.course)
    );
    const courseExtId = course
      ? courseExtIdFor(course.period, course.name, course._cni)
      : `skyward-course-${a.period}-${slugify(a.course)}`;
    const dueDateIso = a.dueDate ? parseDate(a.dueDate) : undefined;

    ops.push({
      op: 'upsert',
      entity: 'assignment',
      key: {
        ...baseKey,
        externalId: `skyward-assign-${a.period}-${slugify(a.title)}-${dueDateIso ?? i}`,
        courseExternalId: courseExtId,
      },
      observedAt: now,
      record: {
        title: a.title,
        dueAt: dueDateIso || undefined,
        status: a.status,
        pointsEarned: a.pointsEarned ? parseFloat(a.pointsEarned) : undefined,
        pointsPossible: a.pointsPossible ? parseFloat(a.pointsPossible) : undefined,
        category: a.category || undefined,
        courseExternalId: courseExtId,
      },
    });
  }

  // Attendance -> attendanceEvent
  for (let i = 0; i < extract.attendance.length; i++) {
    const a = extract.attendance[i]!;
    const course = extract.courses.find((c) => c.period === a.period || c.name === a.course);
    const courseExtId = course
      ? courseExtIdFor(course.period, course.name, course._cni)
      : undefined;

    ops.push({
      op: 'upsert',
      entity: 'attendanceEvent',
      key: {
        ...baseKey,
        externalId: `skyward-attendance-${parseDate(a.date)}-${a.period || 'all'}`,
      },
      observedAt: now,
      record: {
        date: parseDate(a.date),
        status: normalizeAttendanceStatus(a.status),
        periodName: a.period || undefined,
        courseName: a.course || undefined,
        courseExternalId: courseExtId || undefined,
        notes: a.reason || undefined,
      },
    });
  }

  return ops;
}
