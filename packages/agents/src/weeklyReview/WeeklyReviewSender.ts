import { randomUUID } from 'node:crypto';
import { MongoServerError, ObjectId, type Collection, type Db, type Document } from 'mongodb';
import {
  AgentType,
  NotificationChannel,
  NotificationPriority,
  assertNoGradeLeak,
  type INotificationPayload,
  type IStudentSession,
  type IWeekView,
} from '@scholaracle/contracts';
import {
  Student,
  UserRepository,
  type IStudentData,
  type SharedAlertChannel,
} from '@scholaracle/database';
import { WeekGuide, isValidTimeZone } from '@scholaracle/studio-core';
import { createMongoTodaySource } from '../studio/mongoTodaySource';
import { logger } from '../logger';
import { latestWeeklyReviewDue, type IWeeklyReviewDue } from './weeklyReviewSchedule';
import {
  WEEKLY_REVIEW_TRIGGER,
  buildParentWeeklyReviewCopy,
  buildStudentWeeklyReviewEmail,
  buildStudentWeeklyReviewPush,
  type IWeeklyReviewContext,
} from './WeeklyReviewTemplate';

/**
 * One row per (student, ISO week). The unique index (also in database/indexes.ts) makes
 * the reservation atomic across ticks, restarts and two workers.
 */
export const WEEKLY_REVIEW_SENDS_COLLECTION = 'weekly_review_sends';

/** The one queue method the sender needs; `MongoQueue` satisfies it, tests pass a fake. */
export interface IWeeklyReviewQueue {
  add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string>;
}

export interface IWeeklyReviewSenderDeps {
  readonly database: Db;
  readonly queue: IWeeklyReviewQueue;
  /** Web origin for deep links (student: /studio/week; adults: the student's board). */
  readonly webOrigin: string;
  readonly now?: () => Date;
}

export interface IWeeklyReviewTickResult {
  readonly considered: number;
  readonly sent: number;
  /** Nobody to tell (no student login with a device, no alertEmail, no adult copy). */
  readonly noRecipients: number;
  /** This week's review already went out (or another worker holds the reservation). */
  readonly alreadySent: number;
  readonly failed: number;
}

export type WeeklyReviewOutcome = 'sent' | 'no_recipients' | 'already_sent' | 'failed';

export interface IWeeklyReviewDelivery {
  readonly channel: NotificationChannel;
  readonly payload: INotificationPayload;
}

/**
 * Students who could receive a review: a student login (push), an alertEmail, or an
 * adult who asked for a copy. Everyone else is skipped before any time-zone work.
 */
export const WEEKLY_REVIEW_CANDIDATE_FILTER: Readonly<Record<string, unknown>> = {
  $or: [
    { 'studentLogin.userId': { $exists: true } },
    { alertEmail: { $type: 'string', $ne: '' } },
    { 'ownerAlertPrefs.weeklyReviewCopy': true },
    { 'sharedWith.weeklyReviewCopy': true },
  ],
};

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

/**
 * Sends each student's Sunday 18:00 weekly review once per week, in the student's own
 * time zone (student review spec §3.3, R4). The view is composed by the same `WeekGuide`
 * and Mongo source the API serves, then handed to the normal delivery pipeline as
 * `deliver` jobs: a push to the student's devices, an email to `alertEmail`, and copies to
 * the adults who turned the toggle on, by their alert channels.
 */
export class WeeklyReviewSender {
  private readonly _db: Db;
  private readonly _queue: IWeeklyReviewQueue;
  private readonly _webOrigin: string;
  private readonly _now: () => Date;
  private _indexReady?: Promise<void>;

  constructor(deps: IWeeklyReviewSenderDeps) {
    this._db = deps.database;
    this._queue = deps.queue;
    this._webOrigin = deps.webOrigin;
    this._now = deps.now ?? ((): Date => new Date());
  }

  /** One scheduler tick: every candidate student, each at most once per week. */
  public async runTick(): Promise<IWeeklyReviewTickResult> {
    const now = this._now();
    const docs = await this._db
      .collection('students')
      .find(WEEKLY_REVIEW_CANDIDATE_FILTER)
      .toArray();
    const tally = { sent: 0, noRecipients: 0, alreadySent: 0, failed: 0 };
    for (const doc of docs) {
      const student = new Student(doc as unknown as IStudentData, doc._id);
      const outcome = await this.processStudent(student, now);
      if (outcome === 'sent') tally.sent += 1;
      else if (outcome === 'no_recipients') tally.noRecipients += 1;
      else if (outcome === 'already_sent') tally.alreadySent += 1;
      else tally.failed += 1;
    }
    return { considered: docs.length, ...tally };
  }

  /**
   * Reserve this student's current week, compose, enqueue, record. A failure after the
   * reservation gives it back so the next tick retries; a duplicate reservation means the
   * review already went out (idempotent across ticks and downtime: the latest Sunday is
   * sent once, never once per missed tick).
   */
  public async processStudent(student: Student, now: Date): Promise<WeeklyReviewOutcome> {
    const studentId = student._id?.toString() ?? '';
    if (studentId === '') return 'failed';
    const timeZone = await this.resolveTimeZone(student);
    const due = latestWeeklyReviewDue(now, timeZone);
    const reserved = await this._reserve(studentId, due, timeZone, now);
    if (!reserved) return 'already_sent';
    try {
      const deliveries = await this.planDeliveries(student, timeZone, due, now);
      for (const delivery of deliveries) {
        await this._queue.add(
          'deliver',
          'deliver-one',
          { notificationPayload: delivery.payload, channel: delivery.channel },
          { maxAttempts: 5 }
        );
      }
      const outcome: WeeklyReviewOutcome = deliveries.length > 0 ? 'sent' : 'no_recipients';
      await this._sends().updateOne(
        { studentId, weekKey: due.weekKey },
        {
          $set: {
            status: outcome,
            sentAt: now,
            deliveries: deliveries.map((d) => ({
              channel: d.channel,
              audience: d.payload.agentType === AgentType.STUDENT ? 'student' : 'adult',
            })),
          },
        }
      );
      return outcome;
    } catch (err) {
      await this._release(studentId, due.weekKey);
      logger.error(
        { err, studentId, weekKey: due.weekKey, job: 'weekly-review' },
        'weekly review failed'
      );
      return 'failed';
    }
  }

  /**
   * The student's stored zone (their login user), else the owner's stored `users.timezone`,
   * else UTC. Raw documents, not the User model: the model fills a default zone in, and a
   * default is not "stored".
   */
  public async resolveTimeZone(student: Student): Promise<string> {
    const users = this._db.collection('users');
    const studentId = student._id?.toString() ?? '';
    if (studentId !== '') {
      const fromStudent = await storedTimeZone(users, { studentId });
      if (fromStudent !== undefined) return fromStudent;
    }
    const ownerId = student.userId.toString();
    if (ObjectId.isValid(ownerId)) {
      const fromOwner = await storedTimeZone(users, { _id: new ObjectId(ownerId) });
      if (fromOwner !== undefined) return fromOwner;
    }
    return 'UTC';
  }

  /** The same composer and source as `GET /api/studio/week`; never a second truth. */
  public async compose(student: Student, timeZone: string, now: Date): Promise<IWeekView> {
    const session: IStudentSession = {
      studentId: student._id?.toString() ?? '',
      displayName: student.name,
      showGrades: student.studentLogin?.showGrades === true,
    };
    const guide = new WeekGuide(
      createMongoTodaySource({ database: this._db, student, baseUrl: this._webOrigin, now }),
      { timeZone }
    );
    const view = await guide.load(session, now);
    assertNoGradeLeak(view, session.showGrades);
    return view;
  }

  /** Every (recipient, channel) the review goes to, as ready-to-route deliver payloads. */
  public async planDeliveries(
    student: Student,
    timeZone: string,
    due: IWeeklyReviewDue,
    now: Date
  ): Promise<readonly IWeeklyReviewDelivery[]> {
    const view = await this.compose(student, timeZone, now);
    const studentId = student._id?.toString() ?? '';
    const users = new UserRepository(this._db);
    const ctx: IWeeklyReviewContext = {
      studentName: student.name,
      studentId,
      view,
      webOrigin: this._webOrigin,
    };
    const triggerData = {
      studentId,
      studentName: student.name,
      weekKey: due.weekKey,
      ...view.counts,
    };
    const out: IWeeklyReviewDelivery[] = [];

    // Student push: the student-role user bound to this profile, when a device is registered.
    const studentUser = await users.findByStudentId(studentId);
    const hasDevice = (studentUser?.devices ?? []).some(
      (d) => typeof d.pushToken === 'string' && d.pushToken.length > 0
    );
    if (studentUser?._id && hasDevice) {
      const push = buildStudentWeeklyReviewPush(ctx);
      out.push({
        channel: NotificationChannel.PUSH,
        payload: payload(
          AgentType.STUDENT,
          studentId,
          studentUser._id.toString(),
          push,
          triggerData,
          [NotificationChannel.PUSH]
        ),
      });
    }

    // Student email, when the parent set one. `studentId` is left blank on purpose:
    // EmailDelivery turns a studentId into a parent-dashboard button a student cannot open.
    const alertEmail = student.alertEmail?.trim() ?? '';
    if (alertEmail !== '') {
      const email = buildStudentWeeklyReviewEmail(ctx);
      out.push({
        channel: NotificationChannel.EMAIL,
        payload: payload(AgentType.STUDENT, '', alertEmail, email, triggerData, [
          NotificationChannel.EMAIL,
        ]),
      });
    }

    // Adults: no copy by default; each person's toggle, each person's channels (Q2).
    const copy = buildParentWeeklyReviewCopy(ctx);
    const addAdult = (
      email: string | undefined,
      phone: string | undefined,
      channels: readonly SharedAlertChannel[]
    ): void => {
      if (channels.includes('email') && email !== undefined && email.trim() !== '') {
        out.push({
          channel: NotificationChannel.EMAIL,
          payload: payload(AgentType.PARENT, studentId, email.trim(), copy, triggerData, [
            NotificationChannel.EMAIL,
          ]),
        });
      }
      if (channels.includes('sms') && phone !== undefined && phone.trim() !== '') {
        out.push({
          channel: NotificationChannel.SMS,
          payload: payload(AgentType.PARENT, studentId, phone.trim(), copy, triggerData, [
            NotificationChannel.SMS,
          ]),
        });
      }
    };
    if (student.ownerAlertPrefs?.weeklyReviewCopy === true) {
      const owner = await users.findById(student.userId.toString()).catch(() => null);
      addAdult(owner?.email, owner?.phone, student.ownerAlertPrefs.alertChannels ?? ['email']);
    }
    for (const adult of student.sharedWith) {
      if (adult.status !== 'accepted' || adult.weeklyReviewCopy !== true) continue;
      addAdult(adult.email, adult.phone, adult.alertChannels ?? ['email']);
    }
    return out;
  }

  private _sends(): Collection<Document> {
    return this._db.collection(WEEKLY_REVIEW_SENDS_COLLECTION);
  }

  /** Idempotent; createIndexes may not have run yet (tests, fresh databases). */
  private _ensureIndex(): Promise<void> {
    this._indexReady ??= this._sends()
      .createIndex({ studentId: 1, weekKey: 1 }, { unique: true })
      .then(() => undefined);
    return this._indexReady;
  }

  private async _reserve(
    studentId: string,
    due: IWeeklyReviewDue,
    timeZone: string,
    now: Date
  ): Promise<boolean> {
    await this._ensureIndex();
    try {
      await this._sends().insertOne({
        studentId,
        weekKey: due.weekKey,
        dueAt: due.dueAt,
        localDate: due.localDate,
        timeZone,
        status: 'sending',
        reservedAt: now,
      });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  private async _release(studentId: string, weekKey: string): Promise<void> {
    await this._sends()
      .deleteOne({ studentId, weekKey, status: 'sending' })
      .catch(() => {
        /* best effort; the row would otherwise block this week's retry */
      });
  }
}

async function storedTimeZone(
  users: Collection<Document>,
  filter: Record<string, unknown>
): Promise<string | undefined> {
  const doc = await users.findOne(filter, { projection: { timezone: 1 } });
  const zone = doc?.['timezone'];
  return typeof zone === 'string' && zone !== '' && isValidTimeZone(zone) ? zone : undefined;
}

function payload(
  agentType: AgentType,
  studentId: string,
  userId: string,
  content: { readonly subject: string; readonly body: string },
  triggerData: Record<string, unknown>,
  channels: NotificationChannel[]
): INotificationPayload {
  return {
    id: randomUUID(),
    agentType,
    studentId,
    userId,
    subject: content.subject,
    body: content.body,
    priority: NotificationPriority.MEDIUM,
    triggerType: WEEKLY_REVIEW_TRIGGER,
    triggerData,
    channels,
  };
}
