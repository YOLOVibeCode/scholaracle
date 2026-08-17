import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IAeriesFullExtract } from '../../extractors/aeries/aeries-extractors';

// ---------------------------------------------------------------------------
// Transform: IAeriesFullExtract -> ISlcDeltaOp[]
// ---------------------------------------------------------------------------

export interface ITransformContext {
  provider: string;
  adapterId: string;
  studentExternalId: string;
  institutionExternalId: string;
}

function normalizeAttendanceStatus(
  raw: string
): 'present' | 'absent' | 'tardy' | 'excused' | 'unexcused' | 'partial' | 'field_trip' {
  if (!raw) return 'absent';
  const lower = raw.toLowerCase().trim();
  if (lower.includes('present') || lower.includes('p')) return 'present';
  if (lower.includes('absent') || lower.includes('abs')) return 'absent';
  if (lower.includes('tardy') || lower.includes('t')) return 'tardy';
  if (lower.includes('excused') || lower.includes('exc')) return 'excused';
  if (lower.includes('unexcused') || lower.includes('unex')) return 'unexcused';
  if (lower.includes('partial')) return 'partial';
  if (lower.includes('field') || lower.includes('trip')) return 'field_trip';
  return 'absent';
}

function parseDate(dateStr: string): string | undefined {
  if (!dateStr || !dateStr.trim()) return undefined;
  // Aeries uses MM/DD/YYYY format
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  const [, month, day, year] = m;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

function slugify(s: string): string {
  return (
    s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase() || 'unknown'
  );
}

export function transformAeriesExtract(
  extract: IAeriesFullExtract,
  ctx: ITransformContext
): ISlcDeltaOp[] {
  const ops: ISlcDeltaOp[] = [];
  const now = extract.timestamp || new Date().toISOString();
  const asOfDate = now.split('T')[0]!;

  // Process first student (scraper config targets one student; filter happens in scraper)
  const students = extract.students;
  if (students.length === 0) return ops;

  const student = students[0]!;
  const studentId = student.studentId || ctx.studentExternalId;
  const baseKey = {
    provider: ctx.provider,
    adapterId: ctx.adapterId,
    studentExternalId: ctx.studentExternalId,
    institutionExternalId: ctx.institutionExternalId,
  };

  // Student profile
  if (student.name && student.name !== 'Unknown') {
    ops.push({
      op: 'upsert',
      entity: 'studentProfile',
      key: {
        ...baseKey,
        externalId: `aeries-profile-${studentId}`,
      },
      observedAt: now,
      record: {
        name: student.name,
        studentId: student.studentId || undefined,
        gradeLevel: student.grade || undefined,
        school: student.school || undefined,
      },
    });
  }

  // Academic terms — one per distinct, non-empty course.term value
  const seenTerms = new Set<string>();
  for (const course of student.courses) {
    if (!course.term) continue;
    const termExtId = `aeries-term-${slugify(course.term)}`;
    if (!seenTerms.has(termExtId)) {
      seenTerms.add(termExtId);
      ops.push({
        op: 'upsert',
        entity: 'academicTerm',
        key: { ...baseKey, externalId: termExtId },
        observedAt: now,
        record: {
          title: course.term,
          type: 'grading_period',
        },
      });
    }
  }

  // Teachers — deduplicated by name+email
  const seenTeachers = new Map<string, { name: string; email?: string; courseExtIds: string[] }>();

  // Build course externalId lookup first for teacher/attendance joins
  const courseExtIds: string[] = [];
  for (const course of student.courses) {
    // Stable ID: studentId + period + name-slug (no array index)
    courseExtIds.push(`aeries-course-${studentId}-${course.period}-${slugify(course.name)}`);
  }

  // Courses + grade snapshots + assignments
  for (let ci = 0; ci < student.courses.length; ci++) {
    const course = student.courses[ci]!;
    const courseExtId = courseExtIds[ci]!;
    const termExtId = course.term ? `aeries-term-${slugify(course.term)}` : undefined;

    ops.push({
      op: 'upsert',
      entity: 'course',
      key: { ...baseKey, externalId: courseExtId },
      observedAt: now,
      record: {
        title: course.name,
        teacherName: course.teacher || undefined,
        teacherEmail: course.teacherEmail || undefined,
        period: course.period || undefined,
        room: course.room || undefined,
        termExternalId: termExtId,
      },
    });

    // Collect teacher for dedup pass below
    if (course.teacher) {
      const key = `${course.teacher}||${course.teacherEmail || ''}`;
      const existing = seenTeachers.get(key);
      if (existing) {
        existing.courseExtIds.push(courseExtId);
      } else {
        seenTeachers.set(key, {
          name: course.teacher,
          email: course.teacherEmail || undefined,
          courseExtIds: [courseExtId],
        });
      }
    }

    // Grade snapshot per course (currentPercent -> percentGrade)
    if (course.currentPercent !== null || course.currentGrade !== null) {
      ops.push({
        op: 'upsert',
        entity: 'gradeSnapshot',
        key: {
          ...baseKey,
          externalId: `aeries-grade-${courseExtId}`,
          courseExternalId: courseExtId,
        },
        observedAt: now,
        record: {
          courseExternalId: courseExtId,
          asOfDate,
          percentGrade: course.currentPercent ?? undefined,
          missingCount: course.missingCount || undefined,
        },
      });
    }

    // Assignments — stable ID: studentId + period + assignment.number (or date+slug fallback)
    for (let ai = 0; ai < course.assignments.length; ai++) {
      const a = course.assignments[ai]!;
      const assignSlug = a.number
        ? a.number
        : `${parseDate(a.dateDue) ?? 'nodate'}-${slugify(a.title).slice(0, 20)}`;
      const aExtId = `aeries-assign-${studentId}-${course.period}-${assignSlug}`;

      let status:
        | 'missing'
        | 'submitted'
        | 'graded'
        | 'late'
        | 'not_started'
        | 'in_progress'
        | 'excused'
        | 'unknown' = 'unknown';
      if (a.isMissing) status = 'missing';
      else if (a.gradingComplete && a.scoreEarned !== null) status = 'graded';
      else if (a.dateCompleted) status = 'submitted';

      ops.push({
        op: 'upsert',
        entity: 'assignment',
        key: { ...baseKey, externalId: aExtId, courseExternalId: courseExtId },
        observedAt: now,
        record: {
          title: a.title,
          dueAt: parseDate(a.dateDue),
          assignedAt: parseDate(a.dateAssigned),
          status,
          pointsPossible: a.scorePossible ?? undefined,
          pointsEarned: a.scoreEarned ?? undefined,
          percentScore: a.percentCorrect ?? undefined,
          category: a.category || undefined,
          isMissing: a.isMissing,
          courseExternalId: courseExtId,
          termExternalId: termExtId,
        },
      });
    }
  }

  // Teacher ops (after course pass for courseExtIds)
  for (const [, { name, email, courseExtIds: teacherCourseIds }] of seenTeachers) {
    ops.push({
      op: 'upsert',
      entity: 'teacher',
      key: { ...baseKey, externalId: `aeries-teacher-${studentId}-${slugify(name)}` },
      observedAt: now,
      record: {
        name,
        email,
        courseExternalIds: teacherCourseIds,
      },
    });
  }

  // Build period→courseExtId lookup for attendance FK
  const periodToCourseExtId = new Map<string, string>();
  for (let ci = 0; ci < student.courses.length; ci++) {
    const course = student.courses[ci]!;
    if (course.period) periodToCourseExtId.set(course.period, courseExtIds[ci]!);
  }

  // Attendance events — stable ID: studentId + date + period
  for (const att of student.attendance) {
    const dateStr = parseDate(att.date);
    if (!dateStr) continue;

    const attExtId = `aeries-attendance-${studentId}-${dateStr}-${att.period || 'all'}`;
    const courseExtId = att.period ? periodToCourseExtId.get(att.period) : undefined;

    ops.push({
      op: 'upsert',
      entity: 'attendanceEvent',
      key: { ...baseKey, externalId: attExtId },
      observedAt: now,
      record: {
        date: dateStr,
        status: normalizeAttendanceStatus(att.status),
        periodName: att.period || undefined,
        courseName: att.course || undefined,
        courseExternalId: courseExtId || undefined,
        notes: att.reason || undefined,
        excuseReason: att.reason || undefined,
      },
    });
  }

  return ops;
}
