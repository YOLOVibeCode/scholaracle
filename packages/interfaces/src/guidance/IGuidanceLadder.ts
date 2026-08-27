/**
 * Guidance worker ports. Studio pages must not import these.
 */

export interface IGuidanceClock {
  now(): Date;
  /** Local hour 0–23 in the given IANA timezone. */
  localHour(timezone: string): number;
}

export type AssignmentLadderStatus = 'missing' | 'submitted' | 'graded' | 'unknown';

export interface IAssignmentState {
  status(studentId: string, assignmentExternalId: string): Promise<AssignmentLadderStatus>;
}

export interface INotificationSink {
  send(input: {
    readonly audience: 'student' | 'parent';
    readonly studentId: string;
    readonly body: string;
    readonly deepLink: string;
  }): Promise<void>;
}

export type LadderStep = 't48h' | 't18h' | 't12h' | 't72h';

export interface IGuidanceSendLog {
  alreadySent(studentId: string, assignmentExternalId: string, step: LadderStep): Promise<boolean>;
  markSent(studentId: string, assignmentExternalId: string, step: LadderStep): Promise<void>;
  /** Student ladder pushes today. Positive / encouragement does not count. */
  studentLadderSendsToday(studentId: string): Promise<number>;
  recordStudentLadderSend(studentId: string): Promise<void>;
}
