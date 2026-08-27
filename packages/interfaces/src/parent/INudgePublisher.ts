/**
 * Parent-only: send a student a one-off nudge for an assignment.
 * Studio pages must not import this.
 */

export interface INudgePublisher {
  nudge(studentId: string, assignmentExternalId: string): Promise<void>;
}
