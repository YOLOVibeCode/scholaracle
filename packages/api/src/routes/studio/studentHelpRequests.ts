import type { Collection, Db, Document } from 'mongodb';
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

/**
 * Last-sent time per (studentId, assignmentExternalId). The unique index (also declared in
 * database/indexes.ts) is what makes the window reservation atomic under concurrent taps.
 */
export const STUDENT_HELP_REQUESTS_COLLECTION = 'student_help_requests';

/** Assignment-doc fields a "Need help" ask writes; cleared whenever the status moves on. */
export const HELP_FIELDS_UNSET = {
  studentNote: '',
  studentNoteAt: '',
  studentHelpRequestedAt: '',
} as const;

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
  /** IANA time zone of the owner, so copy renders due dates in their day. */
  readonly resolveTimeZone?: (ownerUserId: string) => Promise<string | undefined>;
  readonly now?: () => Date;
}

type Reservation =
  | { readonly won: true; readonly previous?: Date }
  | { readonly won: false; readonly nextAllowedAt: string };

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
 * an `alerts` row (parent inbox, keyed by the student's external id like ingest) plus a
 * `notify` job (keyed by the Mongo id the recipient resolver looks up), at most once per
 * assignment per 24 h. The window is reserved atomically before anything is sent, so two
 * concurrent taps produce exactly one alert.
 */
export class StudentHelpRequests {
  private readonly _db: Db;
  private readonly _queue?: IAlertJobQueue;
  private readonly _webOrigin: string;
  private readonly _resolveTimeZone?: (ownerUserId: string) => Promise<string | undefined>;
  private readonly _now: () => Date;
  private _indexReady?: Promise<void>;

  constructor(deps: IStudentHelpRequestsDeps) {
    this._db = deps.database;
    this._queue = deps.queue;
    this._webOrigin = deps.webOrigin ?? '';
    this._resolveTimeZone = deps.resolveTimeZone;
    this._now = deps.now ?? ((): Date => new Date());
  }

  public async notifyAdults(
    student: Student,
    assignment: IHelpRequestAssignment,
    note?: string
  ): Promise<IHelpRequestOutcome> {
    const now = this._now();
    const mongoId = student._id?.toString() ?? '';
    const key = { studentId: mongoId, assignmentExternalId: assignment.externalId };

    const reservation = await this._reserveWindow(key, now);
    if (!reservation.won) {
      return { notified: false, nextAllowedAt: reservation.nextAllowedAt };
    }
    try {
      await this._send(student, assignment, note, now);
    } catch (error) {
      await this._releaseWindow(key, reservation.previous);
      throw error;
    }
    return { notified: true };
  }

  private _requests(): Collection<Document> {
    return this._db.collection(STUDENT_HELP_REQUESTS_COLLECTION);
  }

  /** Idempotent; the boot-time createIndexes may not have run (tests, fresh databases). */
  private _ensureIndex(): Promise<void> {
    this._indexReady ??= this._requests()
      .createIndex({ studentId: 1, assignmentExternalId: 1 }, { unique: true })
      .then(() => undefined);
    return this._indexReady;
  }

  /**
   * One round trip: insert the row or, when its last send is older than the window, move
   * `lastSentAt` to now. The pre-image says whether this call won the window.
   */
  private async _reserveWindow(
    key: { studentId: string; assignmentExternalId: string },
    now: Date
  ): Promise<Reservation> {
    await this._ensureIndex();
    const cutoff = new Date(now.getTime() - HELP_REQUEST_WINDOW_MS);
    const expired = { $lt: [{ $ifNull: ['$lastSentAt', new Date(0)] }, cutoff] };
    const before = await this._requests().findOneAndUpdate(
      key,
      [
        {
          $set: {
            lastSentAt: { $cond: [expired, now, '$lastSentAt'] },
            count: { $cond: [expired, { $add: [{ $ifNull: ['$count', 0] }, 1] }, '$count'] },
            createdAt: { $ifNull: ['$createdAt', now] },
            updatedAt: now,
          },
        },
      ],
      { upsert: true, returnDocument: 'before' }
    );
    const previous = before?.['lastSentAt'];
    if (!(previous instanceof Date)) return { won: true };
    if (previous < cutoff) return { won: true, previous };
    const nextAllowedAt = new Date(previous.getTime() + HELP_REQUEST_WINDOW_MS).toISOString();
    return { won: false, nextAllowedAt };
  }

  /** The send failed after the window was taken: give it back so the student can retry. */
  private async _releaseWindow(
    key: { studentId: string; assignmentExternalId: string },
    previous: Date | undefined
  ): Promise<void> {
    const update =
      previous === undefined
        ? { $unset: { lastSentAt: '' }, $inc: { count: -1 } }
        : { $set: { lastSentAt: previous }, $inc: { count: -1 } };
    await this._requests().updateOne(key, update);
  }

  private async _send(
    student: Student,
    assignment: IHelpRequestAssignment,
    note: string | undefined,
    now: Date
  ): Promise<void> {
    const mongoId = student._id?.toString() ?? '';
    // Alerts rows carry the external id (ingest.ts does the same; the alerts tab filters on it).
    const externalId = student.studentId ?? mongoId;
    const ownerUserId = student.dataUserId();
    const timeZone = await this._resolveTimeZone?.(ownerUserId);
    const relatedData = this._relatedData(student, assignment, note, now, timeZone);

    await new AlertRepository(this._db).create({
      userId: ownerUserId,
      studentId: externalId,
      type: AlertType.STUDENT_NEEDS_HELP,
      severity: 'info',
      message: `${firstName(student.name)} asked for help with ${assignment.title}`,
      relatedData,
    });
    if (this._queue) {
      // The notify job keeps the Mongo id: resolveAllAlertRecipients does findById on it.
      await this._queue.add(
        'notify',
        'deliver-notification',
        {
          alert: {
            studentId: mongoId,
            type: AlertType.STUDENT_NEEDS_HELP,
            severity: 'info',
            relatedData,
            userId: ownerUserId,
          },
        },
        { maxAttempts: 5 }
      );
    }
  }

  private _relatedData(
    student: Student,
    assignment: IHelpRequestAssignment,
    note: string | undefined,
    now: Date,
    timeZone: string | undefined
  ): Record<string, unknown> {
    const mongoId = student._id?.toString() ?? '';
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
      ...(timeZone !== undefined ? { timeZone } : {}),
      studentName: student.name,
      askedAt: now.toISOString(),
      ...(this._webOrigin !== '' ? { dashboardUrl: parentBoardUrl(this._webOrigin, mongoId) } : {}),
    };
  }
}
