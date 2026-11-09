import type { Db } from 'mongodb';
import { AlertType } from '@scholaracle/contracts';
import { AlertRepository, type Student } from '@scholaracle/database';

/**
 * The one queue method the studio needs. `MongoQueue` (agents) satisfies it; tests pass a fake.
 * Need-help alerts ride the same `notify` jobs ingest enqueues for detected alerts, so the
 * NotificationWorker, the recipient resolver and the audience map treat them like any other.
 */
export interface IAlertJobQueue {
  add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string>;
}

/** One alert per assignment per 24 h (student review spec §3.2). */
export const HELP_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Last-sent time per (studentId, assignmentExternalId); unique index in database/indexes.ts. */
export const STUDENT_HELP_REQUESTS_COLLECTION = 'student_help_requests';

export interface IHelpRequestAssignment {
  readonly externalId: string;
  readonly title: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
  readonly dueAt?: string;
}

export interface IHelpRequestOutcome {
  /** True when the adults were told this time. */
  readonly notified: boolean;
  /** When rate-limited: ISO time the next alert may go out. */
  readonly nextAllowedAt?: string;
}

export interface IStudentHelpRequestsDeps {
  readonly database: Db;
  readonly queue?: IAlertJobQueue;
  /** Web origin for the parent deep link (the studio router's baseUrl). */
  readonly webOrigin?: string;
  readonly now?: () => Date;
}

/** Parent board for one student, opened on the Needs attention bucket. */
export function parentBoardUrl(webOrigin: string, studentId: string): string {
  const origin = webOrigin.replace(/\/+$/, '');
  return `${origin}/dashboard/students/${encodeURIComponent(studentId)}?board=needs_attention#action-board`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Turns a student's "Need help" tap into a `student_needs_help` alert for the adults:
 * an `alerts` row (parent inbox) plus a `notify` job (email/SMS/push via the worker),
 * at most once per assignment per 24 h.
 */
export class StudentHelpRequests {
  private readonly _db: Db;
  private readonly _queue?: IAlertJobQueue;
  private readonly _webOrigin: string;
  private readonly _now: () => Date;

  constructor(deps: IStudentHelpRequestsDeps) {
    this._db = deps.database;
    this._queue = deps.queue;
    this._webOrigin = deps.webOrigin ?? '';
    this._now = deps.now ?? ((): Date => new Date());
  }

  public async notifyAdults(
    student: Student,
    assignment: IHelpRequestAssignment,
    note?: string
  ): Promise<IHelpRequestOutcome> {
    const now = this._now();
    const studentId = student._id?.toString() ?? '';
    const key = { studentId, assignmentExternalId: assignment.externalId };
    const requests = this._db.collection(STUDENT_HELP_REQUESTS_COLLECTION);

    const previous = await requests.findOne(key);
    const lastSentAt = previous?.['lastSentAt'];
    if (
      lastSentAt instanceof Date &&
      now.getTime() - lastSentAt.getTime() < HELP_REQUEST_WINDOW_MS
    ) {
      const nextAllowedAt = new Date(lastSentAt.getTime() + HELP_REQUEST_WINDOW_MS).toISOString();
      return { notified: false, nextAllowedAt };
    }

    const ownerUserId = student.dataUserId();
    const relatedData = this._relatedData(student, assignment, note, now);
    await new AlertRepository(this._db).create({
      userId: ownerUserId,
      studentId,
      type: AlertType.STUDENT_NEEDS_HELP,
      severity: 'info',
      message: `${firstName(student.name)} asked for help with ${assignment.title}`,
      relatedData,
    });
    if (this._queue) {
      await this._queue.add(
        'notify',
        'deliver-notification',
        {
          alert: {
            studentId,
            type: AlertType.STUDENT_NEEDS_HELP,
            severity: 'info',
            relatedData,
            userId: ownerUserId,
          },
        },
        { maxAttempts: 5 }
      );
    }
    await requests.updateOne(
      key,
      {
        $set: { lastSentAt: now, updatedAt: now, ...(note !== undefined ? { note } : {}) },
        $setOnInsert: { createdAt: now },
        $inc: { count: 1 },
      },
      { upsert: true }
    );
    return { notified: true };
  }

  private _relatedData(
    student: Student,
    assignment: IHelpRequestAssignment,
    note: string | undefined,
    now: Date
  ): Record<string, unknown> {
    const studentId = student._id?.toString() ?? '';
    return {
      assignmentExternalId: assignment.externalId,
      title: assignment.title,
      // `assignment`/`course` are the keys the digest and SMS templates already read.
      assignment: assignment.title,
      ...(assignment.courseExternalId !== undefined
        ? { courseExternalId: assignment.courseExternalId }
        : {}),
      ...(assignment.courseName !== undefined
        ? { courseName: assignment.courseName, course: assignment.courseName }
        : {}),
      ...(assignment.dueAt !== undefined ? { dueAt: assignment.dueAt } : {}),
      ...(note !== undefined ? { note } : {}),
      studentName: student.name,
      askedAt: now.toISOString(),
      ...(this._webOrigin !== ''
        ? { dashboardUrl: parentBoardUrl(this._webOrigin, studentId) }
        : {}),
    };
  }
}
