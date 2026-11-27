/**
 * Guidance worker ports. Studio pages must not import these.
 */

export interface IGuidanceClock {
  now(): Date;
}

/**
 * How the portal has an assignment, as far as reminders go:
 * - `closed`: submitted, graded or excused. There is nothing more to do.
 * - `missing`: the portal marks it missing or late.
 * - `open`: anything else, including no status at all.
 */
export type AssignmentLadderStatus = 'closed' | 'missing' | 'open';

/** An assignment as the latest sync left it. */
export interface IAssignmentNow {
  readonly status: AssignmentLadderStatus;
  /** When it is due now. Null when it no longer has a due time. */
  readonly dueAt: Date | null;
}

export interface IAssignmentState {
  /**
   * The assignment as it stands now, read when a reminder is about to go out. Null when
   * the portal no longer lists it.
   */
  current(studentId: string, assignmentExternalId: string): Promise<IAssignmentNow | null>;
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

/**
 * One reminder: one step of one assignment due at one time, for the student or for the
 * parent. When a teacher moves the deadline the reminders for the new time are new ones:
 * "due Thursday" having gone out does not stand in for "due Monday".
 */
export interface IGuidanceSend {
  /** The student's Mongo id. */
  readonly studentId: string;
  readonly assignmentExternalId: string;
  /** The due time the reminder is about. */
  readonly dueAt: Date;
  readonly step: LadderStep;
  readonly audience: 'student' | 'parent';
}

/**
 * Who has been told what. Each sync queues an assignment's coming reminders again and the
 * worker runs ten jobs at once, so many callers ask about the same reminder at the same
 * moment. Looking and taking are therefore one step: a caller that is given a reminder is
 * the only one that sends it.
 */
export interface IGuidanceSendLog {
  /**
   * Takes this reminder for the caller. True for exactly one of any number of callers
   * asking at once; false when another has it or it went out before.
   */
  claim(send: IGuidanceSend): Promise<boolean>;
  /** Gives a taken reminder back so a later try can send it: nobody was told. */
  release(send: IGuidanceSend): Promise<void>;
  /**
   * Takes one of the student's ladder reminders for today. False when `limit` are taken.
   * Positive / encouragement does not count.
   */
  claimStudentSendToday(studentId: string, limit: number): Promise<boolean>;
  /** Gives one of today's back: that reminder did not go out. */
  releaseStudentSendToday(studentId: string): Promise<void>;
}
