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

/** One reminder or nudge, for one audience of one student. */
export interface INotificationSinkMessage {
  readonly audience: 'student' | 'parent';
  /** The student's Mongo id. */
  readonly studentId: string;
  readonly body: string;
  /** A path on the web app, starting with `/`. The sink adds the site's address. */
  readonly deepLink: string;
  /**
   * The assignment the message is about (the portal's external id), when there is one.
   * A push carries it so that a tap on a parent's phone opens that assignment.
   */
  readonly assignmentExternalId?: string;
}

/** What became of one message. */
export interface INotificationSinkResult {
  /**
   * How many deliveries the message became: a push and an email are two. Zero means there
   * was nobody to reach (a student with no login, say) and nothing was sent. Callers must
   * not record a message as sent when this is zero.
   */
  readonly deliveries: number;
}

export interface INotificationSink {
  send(input: INotificationSinkMessage): Promise<INotificationSinkResult>;
}

export type LadderStep = 't48h' | 't18h' | 't12h' | 't72h';

export interface IGuidanceSendLog {
  alreadySent(studentId: string, assignmentExternalId: string, step: LadderStep): Promise<boolean>;
  markSent(studentId: string, assignmentExternalId: string, step: LadderStep): Promise<void>;
  /** Student ladder pushes today. Positive / encouragement does not count. */
  studentLadderSendsToday(studentId: string): Promise<number>;
  recordStudentLadderSend(studentId: string): Promise<void>;
}
