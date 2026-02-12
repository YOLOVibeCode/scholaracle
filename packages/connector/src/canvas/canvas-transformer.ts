import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcEventSeries,
} from '@scholaracle/contracts';
import type { ICanvasAssignment, ICanvasSubmission, ICanvasCalendarEvent } from './canvas-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

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
