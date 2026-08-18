import type { ISlcDeltaOp } from '@scholaracle/contracts';
export type {
  ICanvasBrowserExtract,
  ICanvasBrowserCourse,
  ICanvasBrowserTeacher,
  ICanvasBrowserAssignment,
  ICanvasBrowserFile,
  ICanvasBrowserModule,
  ICanvasModuleItem,
  ICanvasBrowserToDoItem,
  ICanvasBrowserEvent,
  ICanvasBrowserAnnouncement,
} from '../../extractors/canvas/canvas-extractors';

// ---------------------------------------------------------------------------
// Semester inference from due date (Aug–Dec = fall, Jan–May = spring) for termExternalId
// ---------------------------------------------------------------------------

/** Parse YYYY-MM-DD from ISO or date string; returns undefined if unparseable. */
function parseDateToYMD(dateStr: string | undefined): string | undefined {
  if (!dateStr || dateStr.length < 10) return undefined;
  const iso = dateStr.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return undefined;
}

/**
 * Infer semester (fall-YYYY or spring-YYYY) from a due date for Canvas.
 * Aug–Dec → fall; Jan–May → spring; Jun–Jul → spring of same calendar year.
 */
function getCanvasTermExternalIdForDueDate(
  dueDateStr: string | undefined,
  _extractTimestamp: string
): string | undefined {
  const ymd = parseDateToYMD(dueDateStr);
  if (!ymd) return undefined;
  const year = parseInt(ymd.slice(0, 4), 10);
  const month = parseInt(ymd.slice(5, 7), 10);
  if (month >= 8 && month <= 12) return `canvas-term-fall-${year}`;
  if (month >= 1 && month <= 5) return `canvas-term-spring-${year}`;
  if (month === 6 || month === 7) return `canvas-term-spring-${year}`;
  return undefined;
}

/** Build fall/spring term definitions for the school year implied by extract timestamp. */
function getCanvasSemesterTerms(
  extractTimestamp: string
): ReadonlyArray<{ externalId: string; title: string; startDate: string; endDate: string }> {
  const ymd = extractTimestamp.slice(0, 10);
  const year = parseInt(ymd.slice(0, 4), 10);
  const month = parseInt(ymd.slice(5, 7), 10);
  const fallYear = month >= 1 && month <= 7 ? year - 1 : year;
  const springYear = fallYear + 1;
  return [
    {
      externalId: `canvas-term-fall-${fallYear}`,
      title: `Fall ${fallYear}`,
      startDate: `${fallYear}-08-01`,
      endDate: `${fallYear}-12-31`,
    },
    {
      externalId: `canvas-term-spring-${springYear}`,
      title: `Spring ${springYear}`,
      startDate: `${springYear}-01-01`,
      endDate: `${springYear}-05-31`,
    },
  ];
}

import type {
  ICanvasBrowserExtract,
  ICanvasBrowserCourse,
  ICanvasBrowserTeacher,
} from '../../extractors/canvas/canvas-extractors';

// ---------------------------------------------------------------------------
// Transform: ICanvasBrowserExtract -> ISlcDeltaOp[]
// ---------------------------------------------------------------------------

export interface ITransformContext {
  provider: string;
  adapterId: string;
  studentExternalId: string;
  institutionExternalId: string;
}

function parsePoints(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : undefined;
}

function parseGradePercent(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([\d.]+)\s*%/);
  return m ? parseFloat(m[1]!) : undefined;
}

function parseLetterGrade(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(/([A-F][+-]?)/i);
  return m ? m[1]! : undefined;
}

function normalizeStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('miss')) return 'missing';
  if (lower.includes('late')) return 'late';
  if (lower.includes('submit')) return 'submitted';
  if (lower.includes('grad')) return 'graded';
  if (lower.includes('excus')) return 'excused';
  return 'unknown';
}

function slugify(s: string): string {
  return (
    s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase() || 'unknown'
  );
}

// ---------------------------------------------------------------------------
// Material-to-Assignment matching (Layers 1 + 2)
// ---------------------------------------------------------------------------

/**
 * Match course files to assignments using two deterministic signals:
 *   Layer 1 — Canvas module structure (teacher-curated grouping)
 *   Layer 2 — File links in assignment descriptions
 *
 * Returns a Map from fileId → native assignment externalId (e.g. "canvas-assignment-987").
 * Files without a Canvas id are keyed by name and mapped to a name-based externalId.
 */
export function matchMaterialsToAssignments(course: ICanvasBrowserCourse): Map<string, string> {
  /** fileKey → nativeAssignmentExternalId */
  const fileToAssignment = new Map<string, string>();

  // Lookup: Canvas file contentId → stable file key (prefer id, fallback to name)
  const contentIdToFileKey = new Map<string, string>();
  for (const f of course.files) {
    if (f.id) contentIdToFileKey.set(f.id, f.id);
  }

  // Helper: get stable assignment externalId from native Canvas assignment id
  const assignmentExternalId = (
    a: ICanvasBrowserCourse['assignments'][number],
    idx: number
  ): string => (a.id ? `canvas-assignment-${a.id}` : `canvas-assignment-${course.id}-${idx}`);

  // Lookup: Canvas assignment contentId → assignment externalId
  const assignmentIdToExtId = new Map<string, string>();
  for (let i = 0; i < course.assignments.length; i++) {
    const a = course.assignments[i]!;
    if (a.id) assignmentIdToExtId.set(a.id, assignmentExternalId(a, i));
  }

  // --- Layer 1: Module co-occurrence ---
  for (const mod of course.modules) {
    const moduleAssignmentIds: string[] = [];
    const moduleFileContentIds: string[] = [];

    for (const item of mod.items) {
      if (item.type === 'Assignment' && item.contentId) moduleAssignmentIds.push(item.contentId);
      if (item.type === 'File' && item.contentId) moduleFileContentIds.push(item.contentId);
    }

    if (moduleFileContentIds.length === 0) continue;

    if (moduleAssignmentIds.length === 1) {
      const extId = assignmentIdToExtId.get(moduleAssignmentIds[0]!);
      if (extId) {
        for (const fid of moduleFileContentIds) {
          const fileKey = contentIdToFileKey.get(fid);
          if (fileKey && !fileToAssignment.has(fileKey)) {
            fileToAssignment.set(fileKey, extId);
          }
        }
      }
    } else if (moduleAssignmentIds.length > 1) {
      const sorted = [...mod.items].sort((a, b) => a.position - b.position);
      let currentExtId: string | undefined;
      for (const item of sorted) {
        if (item.type === 'Assignment' && item.contentId) {
          currentExtId = assignmentIdToExtId.get(item.contentId);
        } else if (item.type === 'File' && item.contentId && currentExtId !== undefined) {
          const fileKey = contentIdToFileKey.get(item.contentId);
          if (fileKey && !fileToAssignment.has(fileKey)) {
            fileToAssignment.set(fileKey, currentExtId);
          }
        }
      }
    }
  }

  // --- Layer 2: Assignment description link extraction ---
  for (let i = 0; i < course.assignments.length; i++) {
    const a = course.assignments[i]!;
    if (!a.description) continue;

    const extId = assignmentExternalId(a, i);
    const fileIdPattern = /\/files\/(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = fileIdPattern.exec(a.description)) !== null) {
      const fileId = match[1]!;
      if (!fileToAssignment.has(fileId)) {
        fileToAssignment.set(fileId, extId);
      }
    }
  }

  return fileToAssignment;
}

export function transformCanvasExtract(
  extract: ICanvasBrowserExtract,
  ctx: ITransformContext
): ISlcDeltaOp[] {
  const ops: ISlcDeltaOp[] = [];
  const now = extract.timestamp || new Date().toISOString();

  const baseKey = {
    provider: ctx.provider,
    adapterId: ctx.adapterId,
    studentExternalId: ctx.studentExternalId,
    institutionExternalId: ctx.institutionExternalId,
  };

  const semesterTerms = getCanvasSemesterTerms(extract.timestamp || now);
  for (const t of semesterTerms) {
    ops.push({
      op: 'upsert',
      entity: 'academicTerm',
      key: { ...baseKey, externalId: t.externalId },
      observedAt: now,
      record: {
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
        type: 'semester',
      },
    });
  }

  // Student profile
  if (extract.user && extract.user !== 'Unknown') {
    ops.push({
      op: 'upsert',
      entity: 'studentProfile',
      key: { ...baseKey, externalId: `canvas-profile-${ctx.studentExternalId}` },
      observedAt: now,
      record: { name: extract.user },
    });
  }

  // Teachers (deduplicated across courses)
  const seenTeachers = new Map<
    string,
    { teacher: ICanvasBrowserTeacher; courseExtIds: string[] }
  >();
  for (const course of extract.courses) {
    const courseExtId = `canvas-course-${course.id}`;
    for (const t of course.teachers) {
      const existing = seenTeachers.get(t.id);
      if (existing) {
        existing.courseExtIds.push(courseExtId);
      } else {
        seenTeachers.set(t.id, { teacher: t, courseExtIds: [courseExtId] });
      }
    }
  }
  for (const [tid, { teacher, courseExtIds }] of seenTeachers) {
    ops.push({
      op: 'upsert',
      entity: 'teacher',
      key: { ...baseKey, externalId: `canvas-teacher-${tid}` },
      observedAt: now,
      record: {
        name: teacher.name,
        email: teacher.email || undefined,
        courseExternalIds: courseExtIds,
      },
    });
  }

  // Courses + grade snapshots
  for (const course of extract.courses) {
    const courseExtId = `canvas-course-${course.id}`;
    const primaryTeacher = course.teachers[0];

    ops.push({
      op: 'upsert',
      entity: 'course',
      key: { ...baseKey, externalId: courseExtId },
      observedAt: now,
      record: {
        title: course.name,
        courseCode: course.courseCode || undefined,
        teacherName: primaryTeacher?.name || course.teacher || undefined,
        teacherEmail: primaryTeacher?.email || undefined,
        period: course.period || undefined,
        term: course.term || undefined,
        url: course.url,
      },
    });

    if (course.grade) {
      ops.push({
        op: 'upsert',
        entity: 'gradeSnapshot',
        key: { ...baseKey, externalId: `canvas-grade-${course.id}`, courseExternalId: courseExtId },
        observedAt: now,
        record: {
          courseExternalId: courseExtId,
          asOfDate: now.split('T')[0]!,
          percentGrade: parseGradePercent(course.grade),
          letterGrade: parseLetterGrade(course.grade),
          sourceType: 'lms' as const,
        },
      });
    }

    for (let i = 0; i < course.assignments.length; i++) {
      const a = course.assignments[i]!;
      // Native Canvas assignment ID is stable; fall back to courseId+index only when missing.
      const aExtId = a.id ? `canvas-assignment-${a.id}` : `canvas-assignment-${course.id}-${i}`;
      const termExternalId = getCanvasTermExternalIdForDueDate(a.dueDate, extract.timestamp || now);

      ops.push({
        op: 'upsert',
        entity: 'assignment',
        key: { ...baseKey, externalId: aExtId, courseExternalId: courseExtId },
        observedAt: now,
        record: {
          title: a.name,
          dueAt: a.dueDate || undefined,
          pointsPossible: parsePoints(a.points),
          status: normalizeStatus(a.status),
          attachments: a.attachments?.map((att) => ({
            name: att.name,
            url: att.url,
            type: att.contentType || undefined,
          })),
          courseExternalId: courseExtId,
          termExternalId,
        },
      });
    }

    // Match course files to assignments via modules + description links
    // materialMatches: Map<fileId, nativeAssignmentExternalId>
    const materialMatches = matchMaterialsToAssignments(course);

    for (let fi = 0; fi < course.files.length; fi++) {
      const file = course.files[fi]!;
      // Use native Canvas file ID when present; fall back to courseId+slug
      const fileKey = file.id ?? `name-${slugify(file.name)}`;
      const assignmentExternalId = materialMatches.get(file.id ?? fileKey);
      const fileExtId = file.id
        ? `canvas-file-${file.id}`
        : `canvas-file-${course.id}-${slugify(file.name)}-${fi}`;

      ops.push({
        op: 'upsert',
        entity: 'courseMaterial',
        key: {
          ...baseKey,
          externalId: fileExtId,
          courseExternalId: courseExtId,
        },
        observedAt: now,
        record: {
          title: file.name,
          courseExternalId: courseExtId,
          assignmentExternalId,
          type: 'document' as const,
          url: file.url,
          fileName: file.name,
          mimeType: file.contentType || undefined,
          extractedText: file.contentDescription || undefined,
        },
      });
    }
  }

  // Announcements -> messages
  for (let i = 0; i < extract.announcements.length; i++) {
    const ann = extract.announcements[i]!;
    const course = extract.courses.find((c) => c.name === ann.course || c.id === ann.course);
    const courseExtId = course ? `canvas-course-${course.id}` : undefined;

    ops.push({
      op: 'upsert',
      entity: 'message',
      key: { ...baseKey, externalId: `canvas-announcement-${i}` },
      observedAt: now,
      record: {
        subject: ann.title,
        body: ann.body || ann.title,
        senderName: 'Canvas',
        senderRole: 'system' as const,
        sentAt: ann.date || now,
        courseExternalId: courseExtId,
        category: 'academic' as const,
      },
    });
  }

  // Upcoming events -> eventSeries (one-off calendar events)
  for (let i = 0; i < extract.upcomingEvents.length; i++) {
    const ev = extract.upcomingEvents[i]!;
    const course = extract.courses.find((c) => c.name === ev.course || c.id === ev.course);
    const courseExtId = course ? `canvas-course-${course.id}` : undefined;
    ops.push({
      op: 'upsert',
      entity: 'eventSeries',
      key: { ...baseKey, externalId: `canvas-event-${i}` },
      observedAt: now,
      record: {
        title: ev.title,
        startAt: ev.date || undefined,
        courseExternalId: courseExtId,
        type: 'other' as const,
      },
    });
  }

  // To-do items -> assignment with status not_started
  for (let i = 0; i < extract.toDoItems.length; i++) {
    const todo = extract.toDoItems[i]!;
    const course = extract.courses.find((c) => c.name === todo.course || c.id === todo.course);
    const courseExtId = course ? `canvas-course-${course.id}` : undefined;
    ops.push({
      op: 'upsert',
      entity: 'assignment',
      key: { ...baseKey, externalId: `canvas-todo-${i}`, courseExternalId: courseExtId },
      observedAt: now,
      record: {
        title: todo.title,
        dueAt: todo.dueDate || undefined,
        status: 'not_started' as const,
        courseExternalId: courseExtId,
      },
    });
  }

  return ops;
}
