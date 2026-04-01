import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcGradeSnapshot,
} from '@scholaracle/contracts';
import type {
  ICanvasCourse,
  ICanvasAssignment,
  ICanvasSubmission,
  ICanvasEnrollment,
} from './canvas-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Canvas submission state to Scholaracle assignment status. */
export function mapCanvasSubmissionStatus(
  submission: ICanvasSubmission | undefined,
  assignment: ICanvasAssignment
): ISlcAssignment['status'] {
  if (!submission) return 'unknown';
  if (submission.missing) return 'missing';
  if (submission.late) return 'late';
  if (submission.workflow_state === 'graded') return 'graded';
  if (submission.workflow_state === 'submitted') return 'submitted';
  if (
    submission.workflow_state === 'unsubmitted' &&
    assignment.due_at &&
    new Date(assignment.due_at) < new Date()
  ) {
    return 'missing';
  }
  if (submission.workflow_state === 'unsubmitted') return 'not_started';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

export function transformCourseToOp(
  course: ICanvasCourse,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `canvas-course-${course.id}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: course.name,
      courseCode: course.course_code,
    },
  };
}

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

export function transformGradeSnapshotToOp(
  courseId: number,
  enrollment: ICanvasEnrollment,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcGradeSnapshot> {
  const percent = enrollment.grades?.current_score ?? 0;
  return {
    op: 'upsert',
    entity: 'gradeSnapshot',
    key: {
      ...baseKey,
      externalId: `canvas-grade-${courseId}-${new Date().toISOString().split('T')[0]}`,
      courseExternalId: `canvas-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      courseExternalId: `canvas-course-${courseId}`,
      percentGrade: percent,
      letterGrade: enrollment.grades?.current_grade ?? undefined,
      asOfDate: new Date().toISOString().split('T')[0]!,
    },
  };
}
