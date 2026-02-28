import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcCourseMaterial,
  ISlcGradeSnapshot,
} from '@scholaracle/contracts';
import type {
  IGoogleCourse,
  IGoogleCourseWork,
  IGoogleStudentSubmission,
  IGoogleMaterial,
  IGoogleMaterialAttachment,
} from './google-classroom-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Google Classroom dueDate + dueTime to an ISO string. */
export function googleDateToIso(
  dueDate?: { year: number; month: number; day: number },
  dueTime?: { hours: number; minutes?: number }
): string | undefined {
  if (!dueDate) return undefined;
  const y = dueDate.year;
  const m = String(dueDate.month).padStart(2, '0');
  const d = String(dueDate.day).padStart(2, '0');
  if (dueTime) {
    const hh = String(dueTime.hours).padStart(2, '0');
    const mm = String(dueTime.minutes ?? 0).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:00Z`;
  }
  return `${y}-${m}-${d}T23:59:59Z`;
}

/** Map Google submission state to Scholaracle assignment status. */
export function mapGoogleSubmissionStatus(
  submission: IGoogleStudentSubmission | undefined
): ISlcAssignment['status'] {
  if (!submission) return 'unknown';
  if (submission.late) return 'late';
  if (submission.assignedGrade !== undefined) return 'graded';
  if (submission.state === 'TURNED_IN') return 'submitted';
  if (submission.state === 'RETURNED') return 'graded';
  if (submission.state === 'NEW' || submission.state === 'CREATED') return 'missing';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

export function transformCourseWorkToOp(
  courseWork: IGoogleCourseWork,
  submission: IGoogleStudentSubmission | undefined,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `gc-coursework-${courseWork.id}`,
      courseExternalId: `gc-course-${courseWork.courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: courseWork.title,
      dueAt: googleDateToIso(courseWork.dueDate, courseWork.dueTime),
      status: mapGoogleSubmissionStatus(submission),
      pointsPossible: courseWork.maxPoints,
      pointsEarned: submission?.assignedGrade,
    },
  };
}

export function transformCourseToOp(
  course: IGoogleCourse,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `gc-course-${course.id}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: course.name,
      courseCode: course.section,
    },
  };
}

export function transformGradeSnapshotToOp(
  courseId: string,
  earned: number,
  possible: number,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcGradeSnapshot> {
  const percent = possible > 0 ? Math.round((earned / possible) * 10000) / 100 : 0;
  return {
    op: 'upsert',
    entity: 'gradeSnapshot',
    key: {
      ...baseKey,
      externalId: `gc-grade-${courseId}-${new Date().toISOString().split('T')[0]}`,
      courseExternalId: `gc-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      courseExternalId: `gc-course-${courseId}`,
      percentGrade: percent,
      asOfDate: new Date().toISOString().split('T')[0]!,
    },
  };
}

const COURSE_EXTERNAL_ID_PREFIX = 'gc-course-';

/** One courseMaterial op per attachment (Drive -> document, YouTube -> video, link -> link). */
export function transformMaterialToOps(
  material: IGoogleMaterial,
  baseKey: BaseKey,
  assignmentExternalId?: string
): ISlcDeltaOp<ISlcCourseMaterial>[] {
  const courseExternalId = `${COURSE_EXTERNAL_ID_PREFIX}${material.courseId}`;
  const ops: ISlcDeltaOp<ISlcCourseMaterial>[] = [];
  const attachments = material.materials ?? [];
  const baseRecord = {
    title: material.title,
    courseExternalId,
    description: material.description,
    postedAt: material.creationTime,
    ...(assignmentExternalId && { assignmentExternalId }),
  };

  attachments.forEach((att: IGoogleMaterialAttachment, idx: number) => {
    const externalId = `gc-material-${material.courseId}-${material.id}-${idx}`;

    if (att.driveFile) {
      ops.push({
        op: 'upsert',
        entity: 'courseMaterial',
        key: { ...baseKey, externalId, courseExternalId },
        observedAt: new Date().toISOString(),
        record: {
          ...baseRecord,
          type: 'document',
          url: att.driveFile.alternateLink,
          title: att.driveFile.title ?? material.title,
        },
      });
      return;
    }
    if (att.youtubeVideo) {
      ops.push({
        op: 'upsert',
        entity: 'courseMaterial',
        key: { ...baseKey, externalId, courseExternalId },
        observedAt: new Date().toISOString(),
        record: {
          ...baseRecord,
          type: 'video',
          url: att.youtubeVideo.alternateLink,
          title: att.youtubeVideo.title ?? material.title,
        },
      });
      return;
    }
    if (att.link) {
      ops.push({
        op: 'upsert',
        entity: 'courseMaterial',
        key: { ...baseKey, externalId, courseExternalId },
        observedAt: new Date().toISOString(),
        record: {
          ...baseRecord,
          type: 'link',
          url: att.link.url,
          title: att.link.title ?? material.title,
        },
      });
      return;
    }
    if (att.form) {
      ops.push({
        op: 'upsert',
        entity: 'courseMaterial',
        key: { ...baseKey, externalId, courseExternalId },
        observedAt: new Date().toISOString(),
        record: {
          ...baseRecord,
          type: 'link',
          url: att.form.formUrl,
          title: att.form.title ?? material.title,
        },
      });
    }
  });

  return ops;
}
