import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcEventSeries,
  ISlcCourseMaterial,
} from '@scholaracle/contracts';
import type {
  ICanvasAssignment,
  ICanvasSubmission,
  ICanvasCalendarEvent,
  ICanvasFile,
  ICanvasPage,
} from './canvas-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

/** Map Canvas content_type to ISlcCourseMaterial type. */
function mapContentTypeToMaterialType(contentType: string): ISlcCourseMaterial['type'] {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('video') || ct.includes('mp4') || ct.includes('webm')) return 'video';
  if (ct.includes('pdf') || ct.includes('document') || ct.includes('msword') || ct.includes('word'))
    return 'document';
  if (ct.includes('presentation') || ct.includes('powerpoint') || ct.includes('pptx'))
    return 'presentation';
  return 'document';
}

/**
 * Maps Canvas submission state to Scholaracle assignment status.
 */
export function mapCanvasSubmissionStatus(
  submission: ICanvasSubmission | undefined,
  _assignment: ICanvasAssignment
): ISlcAssignment['status'] {
  if (!submission) return 'unknown';
  if (submission.missing) return 'missing';
  if (submission.late) return 'late';
  if (submission.workflow_state === 'graded') return 'graded';
  if (submission.workflow_state === 'submitted') return 'submitted';
  return 'unknown';
}

/**
 * Transforms a Canvas assignment + optional submission into an ISlcDeltaOp.
 */
export function transformAssignmentToOp(
  assignment: ICanvasAssignment,
  submission: ICanvasSubmission | undefined,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `canvas-assignment-${assignment.id}`,
      courseExternalId: `canvas-course-${assignment.course_id}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: assignment.name,
      dueAt: assignment.due_at ?? undefined,
      status: mapCanvasSubmissionStatus(submission, assignment),
      pointsPossible: assignment.points_possible,
      pointsEarned: submission?.score ?? undefined,
    },
  };
}

/**
 * Transforms a Canvas calendar event into an ISlcDeltaOp (eventSeries).
 */
export function transformCalendarEventToOp(
  event: ICanvasCalendarEvent,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcEventSeries> {
  return {
    op: 'upsert',
    entity: 'eventSeries',
    key: {
      ...baseKey,
      externalId: `canvas-event-${event.id}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: event.title,
      category: 'other',
      timezone: 'UTC',
      startsAt: event.start_at,
      endsAt: event.end_at,
      recurrence: {
        rrule: 'FREQ=DAILY;COUNT=1',
        count: 1,
        exDates: [],
      },
    },
  };
}

/**
 * Transforms a Canvas file into an ISlcDeltaOp (courseMaterial).
 */
export function transformFileToOp(
  file: ICanvasFile,
  courseId: number,
  baseKey: BaseKey,
  assignmentExternalId?: string
): ISlcDeltaOp<ISlcCourseMaterial> {
  return {
    op: 'upsert',
    entity: 'courseMaterial',
    key: {
      ...baseKey,
      externalId: `canvas-file-${file.id}`,
      courseExternalId: `canvas-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: file.display_name,
      courseExternalId: `canvas-course-${courseId}`,
      type: mapContentTypeToMaterialType(file.content_type),
      url: file.url,
      fileName: file.filename,
      mimeType: file.content_type,
      fileSize: file.size,
      postedAt: file.created_at,
      ...(assignmentExternalId && { assignmentExternalId }),
    },
  };
}

/**
 * Transforms a Canvas page (wiki page) into an ISlcDeltaOp (courseMaterial).
 */
export function transformPageToOp(
  page: ICanvasPage,
  courseId: number,
  baseKey: BaseKey,
  assignmentExternalId?: string
): ISlcDeltaOp<ISlcCourseMaterial> {
  return {
    op: 'upsert',
    entity: 'courseMaterial',
    key: {
      ...baseKey,
      externalId: `canvas-page-${page.page_id}`,
      courseExternalId: `canvas-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: page.title,
      courseExternalId: `canvas-course-${courseId}`,
      type: 'document',
      url: page.html_url ?? page.url,
      postedAt: page.created_at,
      extractedText: page.body,
      ...(assignmentExternalId && { assignmentExternalId }),
    },
  };
}
