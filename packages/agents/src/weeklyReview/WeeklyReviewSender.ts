import { createHash, randomUUID } from 'node:crypto';
import { MongoServerError, type Collection, type Db, type Document } from 'mongodb';
import {
  AgentType,
  NotificationChannel,
  NotificationPriority,
  assertNoGradeLeak,
  type INotificationPayload,
  type IStudentSession,
  type IWeekView,
} from '@scholaracle/contracts';
import { Student, UserRepository, type IStudentData, type User } from '@scholaracle/database';
import { WeekGuide } from '@scholaracle/studio-core';
import { createMongoTodaySource } from '../studio/mongoTodaySource';
import { resolveStudentTimeZone } from '../studio/resolveStudentTimeZone';
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

/** A `sending` reservation older than this was left by a crashed tick and may be taken over. */
export const WEEKLY_REVIEW_STALE_RESERVATION_MS = 15 * 60_000;

/** Compose attempts per (student, week) before the sender stops and logs once. */
export const WEEKLY_REVIEW_MAX_ATTEMPTS = 3;

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
  /** Nobody to tell this time; no row is kept, so a toggle later in the week still works. */
  readonly noRecipients: number;
  /** Already sent, given up on, or reserved by another tick/worker right now. */
  readonly skipped: number;
  readonly failed: number;
}

export type WeeklyReviewOutcome = 'sent' | 'no_recipients' | 'skipped' | 'failed';

/**
 * `sending`: reserved, in progress. `sent`: every delivery enqueued. `partial`: some
 * deliveries enqueued, the rest still owed (retaken next tick; only the missing ones go
 * out). `failed`: compose failed; retaken until WEEKLY_REVIEW_MAX_ATTEMPTS.
 */
export type WeeklyReviewRowStatus = 'sending' | 'sent' | 'partial' | 'failed';

export interface IWeeklyReviewDeliveryRecord {
  /** channel:audience:hash(recipient) — stable across ticks, carries no address. */
  readonly key: string;
  readonly channel: NotificationChannel;
  readonly audience: 'student' | 'adult';
  readonly enqueuedAt?: Date;
  readonly jobId?: string;
}

export interface IWeeklyReviewSendRow {
  readonly studentId: string;
  readonly weekKey: string;
  readonly status: WeeklyReviewRowStatus;
  readonly attempts: number;
  readonly reservedAt?: Date;
  readonly deliveries: readonly IWeeklyReviewDeliveryRecord[];
}

export interface IWeeklyReviewDelivery {
  readonly key: string;
  readonly channel: NotificationChannel;
  readonly audience: 'student' | 'adult';
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

/**
 * Zones run from UTC-12 to UTC+14, so at any instant "the latest Sunday 18:00" falls in
 * at most two ISO weeks. Rows for these keys are what a tick needs to know up front.
 */
export function candidateWeekKeys(now: Date): readonly string[] {
  const keys = new Set<string>([
    latestWeeklyReviewDue(now, 'Etc/GMT+12').weekKey, // UTC-12 (POSIX sign)
    latestWeeklyReviewDue(now, 'Etc/GMT-14').weekKey, // UTC+14
  ]);
  return [...keys];
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRow(doc: Document): IWeeklyReviewSendRow {
  const deliveries = Array.isArray(doc['deliveries'])
    ? (doc['deliveries'] as IWeeklyReviewDeliveryRecord[])
    : [];
  return {
    studentId: String(doc['studentId'] ?? ''),
    weekKey: String(doc['weekKey'] ?? ''),
    status: doc['status'] as WeeklyReviewRowStatus,
    attempts: typeof doc['attempts'] === 'number' ? doc['attempts'] : 0,
    reservedAt: doc['reservedAt'] instanceof Date ? doc['reservedAt'] : undefined,
    deliveries,
  };
}

/** True when this tick has nothing to do for the row: sent, given up, or someone is on it. */
export function isRowFinalForTick(row: IWeeklyReviewSendRow, now: Date): boolean {
  if (row.status === 'sent') return true;
  if (row.status === 'failed') return row.attempts >= WEEKLY_REVIEW_MAX_ATTEMPTS;
  if (row.status === 'sending') {
    return (
      row.reservedAt !== undefined &&
      now.getTime() - row.reservedAt.getTime() < WEEKLY_REVIEW_STALE_RESERVATION_MS
    );
  }
  return false; // partial: the missing deliveries still go out
}

export function deliveryKey(
  channel: NotificationChannel,
  audience: 'student' | 'adult',
  recipient: string
): string {
  const digest = createHash('sha256').update(recipient).digest('hex').slice(0, 16);
  return `${channel}:${audience}:${digest}`;
}

function hasPushDevice(user: User | null): user is User {
  return (
    user !== null &&
    user.devices.some((d) => typeof d.pushToken === 'string' && d.pushToken.length > 0)
  );
}

/**
 * Sends each student's Sunday 18:00 weekly review once per week, in the student's own
 * time zone (student review spec §3.3, R4). The view is composed by the same `WeekGuide`,
 * Mongo source and zone rule the API serves, then handed to the normal delivery pipeline
 * as `deliver` jobs: a push to the student's devices, an email to `alertEmail`, and copies
 * to the adults who turned the toggle on, by their alert channels (email, sms, push).
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

  /**
   * One scheduler tick. One query fetches this week's rows for every candidate, and a
   * student with a final row for the latest possible week key is skipped before any zone
   * lookup: that row can only exist if their own clock already passed that Sunday 18:00.
   * (A row for the earlier key proves nothing — their zone may be due for the later one —
   * so those students go on to the exact, zone-aware reservation.)
   */
  public async runTick(): Promise<IWeeklyReviewTickResult> {
    const now = this._now();
    const docs = await this._db
      .collection('students')
      .find(WEEKLY_REVIEW_CANDIDATE_FILTER)
      .toArray();
    const tally = { sent: 0, noRecipients: 0, skipped: 0, failed: 0 };
    if (docs.length === 0) return { considered: 0, ...tally };

    const keys = candidateWeekKeys(now);
    // 'YYYY-Www' sorts as text, year first, so the latest key is the string maximum.
    const latestKey = [...keys].sort().at(-1) ?? '';
    const ids = docs.map((d) => d._id.toString());
    const rows = await this._sends()
      .find({ studentId: { $in: ids }, weekKey: latestKey })
      .toArray();
    const settled = new Set<string>();
    for (const doc of rows) {
      const row = toRow(doc);
      if (isRowFinalForTick(row, now)) settled.add(row.studentId);
    }

    for (const doc of docs) {
      const studentId = doc._id.toString();
      if (settled.has(studentId)) {
        tally.skipped += 1;
        continue;
      }
      const student = new Student(doc as unknown as IStudentData, doc._id);
      const outcome = await this.processStudent(student, now);
      if (outcome === 'sent') tally.sent += 1;
      else if (outcome === 'no_recipients') tally.noRecipients += 1;
      else if (outcome === 'skipped') tally.skipped += 1;
      else tally.failed += 1;
    }
    return { considered: docs.length, ...tally };
  }

  /**
   * Reserve this student's current week (atomically; stale, partial and retryable-failed
   * rows are taken over), compose, enqueue what is still missing, record. A compose
   * failure keeps the row as `failed` with its attempt count; an enqueue failure keeps the
   * deliveries already sent as `partial` so the next tick enqueues only the rest.
   */
  public async processStudent(student: Student, now: Date): Promise<WeeklyReviewOutcome> {
    const studentId = student._id?.toString() ?? '';
    if (studentId === '') return 'failed';
    const timeZone = await this.resolveTimeZone(student);
    const due = latestWeeklyReviewDue(now, timeZone);
    const row = await this._reserve(studentId, due, timeZone, now);
    if (row === null) return 'skipped';
    const weekKey = due.weekKey;

    let planned: readonly IWeeklyReviewDelivery[];
    try {
      planned = await this.planDeliveries(student, timeZone, due, now);
    } catch (err) {
      await this._recordFailure(studentId, weekKey, row.attempts, now, err);
      return 'failed';
    }
    if (planned.length === 0) {
      // Nothing to send today: keep no row, so an adult who turns the copy on later this
      // week (or a device registered later) still gets this Sunday's review.
      await this._sends().deleteOne({ studentId, weekKey, status: 'sending' });
      return 'no_recipients';
    }

    const already = new Map(
      row.deliveries.filter((d) => d.enqueuedAt !== undefined).map((d) => [d.key, d])
    );
    const records: IWeeklyReviewDeliveryRecord[] = planned.map((d) => {
      const prior = already.get(d.key);
      return {
        key: d.key,
        channel: d.channel,
        audience: d.audience,
        ...(prior !== undefined ? { enqueuedAt: prior.enqueuedAt, jobId: prior.jobId } : {}),
      };
    });
    await this._sends().updateOne({ studentId, weekKey }, { $set: { deliveries: records } });

    for (const delivery of planned) {
      if (already.has(delivery.key)) continue;
      try {
        const jobId = await this._queue.add(
          'deliver',
          'deliver-one',
          { notificationPayload: delivery.payload, channel: delivery.channel },
          { maxAttempts: 5 }
        );
        await this._sends().updateOne(
          { studentId, weekKey, 'deliveries.key': delivery.key },
          { $set: { 'deliveries.$.enqueuedAt': now, 'deliveries.$.jobId': jobId } }
        );
      } catch (err) {
        await this._sends().updateOne(
          { studentId, weekKey },
          { $set: { status: 'partial', lastError: errorMessage(err), failedAt: now } }
        );
        logger.error(
          { err, studentId, weekKey, channel: delivery.channel, job: 'weekly-review' },
          'weekly review enqueue failed; the missing deliveries go out next tick'
        );
        return 'failed';
      }
    }
    await this._sends().updateOne(
      { studentId, weekKey },
      { $set: { status: 'sent', sentAt: now }, $unset: { lastError: '', failedAt: '' } }
    );
    return 'sent';
  }

  /** The same zone rule as `GET /api/studio/week`: login zone → owner zone → America/New_York. */
  public resolveTimeZone(student: Student): Promise<string> {
    return resolveStudentTimeZone(this._db, student);
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
    const out = new Map<string, IWeeklyReviewDelivery>();
    const add = (
      channel: NotificationChannel,
      audience: 'student' | 'adult',
      recipient: string,
      payloadStudentId: string,
      content: { readonly subject: string; readonly body: string }
    ): void => {
      const key = deliveryKey(channel, audience, recipient);
      if (out.has(key)) return;
      out.set(key, {
        key,
        channel,
        audience,
        payload: payload(
          audience === 'student' ? AgentType.STUDENT : AgentType.PARENT,
          payloadStudentId,
          recipient,
          content,
          triggerData,
          channel
        ),
      });
    };

    // Student push: the student-role user bound to this profile, when a device is registered.
    const studentUser = await users.findByStudentId(studentId);
    if (hasPushDevice(studentUser) && studentUser._id) {
      add(
        NotificationChannel.PUSH,
        'student',
        studentUser._id.toString(),
        studentId,
        buildStudentWeeklyReviewPush(ctx)
      );
    }

    // Student email, when the parent set one. `studentId` is left blank on purpose:
    // EmailDelivery turns a studentId into a parent-dashboard button a student cannot open.
    const alertEmail = student.alertEmail?.trim() ?? '';
    if (alertEmail !== '') {
      add(NotificationChannel.EMAIL, 'student', alertEmail, '', buildStudentWeeklyReviewEmail(ctx));
    }

    // Adults: no copy by default; each person's toggle, each person's channels (Q2).
    interface IAdult {
      readonly email?: string;
      readonly phone?: string;
      readonly userId?: string;
      readonly channels: readonly string[];
    }
    const adults: IAdult[] = [];
    if (student.ownerAlertPrefs?.weeklyReviewCopy === true) {
      const owner = await users.findById(student.userId.toString()).catch(() => null);
      adults.push({
        email: owner?.email,
        phone: owner?.phone,
        userId: owner?._id?.toString(),
        channels: student.ownerAlertPrefs.alertChannels ?? ['email'],
      });
    }
    for (const adult of student.sharedWith) {
      if (adult.status !== 'accepted' || adult.weeklyReviewCopy !== true) continue;
      adults.push({
        email: adult.email,
        phone: adult.phone,
        userId: adult.userId,
        channels: adult.alertChannels ?? ['email'],
      });
    }
    const copy = buildParentWeeklyReviewCopy(ctx);
    for (const adult of adults) {
      const email = adult.email?.trim() ?? '';
      const phone = adult.phone?.trim() ?? '';
      if (adult.channels.includes('email') && email !== '') {
        add(NotificationChannel.EMAIL, 'adult', email, studentId, copy);
      }
      if (adult.channels.includes('sms') && phone !== '') {
        add(NotificationChannel.SMS, 'adult', phone, studentId, copy);
      }
      if (adult.channels.includes('push') && adult.userId !== undefined && adult.userId !== '') {
        // The adult's own devices, keyed by their user id exactly as alert pushes are routed.
        const user = await users.findById(adult.userId).catch(() => null);
        if (hasPushDevice(user) && user._id) {
          add(NotificationChannel.PUSH, 'adult', user._id.toString(), studentId, copy);
        }
      }
    }
    return [...out.values()];
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

  /**
   * One atomic round trip: insert the week's row, or take over a row that is stale
   * (`sending` for longer than the reservation window), `partial`, or `failed` with
   * attempts left. A row that is `sent`, fresh, or out of attempts makes the upsert collide
   * on the unique index, which is the "not yours" answer.
   */
  private async _reserve(
    studentId: string,
    due: IWeeklyReviewDue,
    timeZone: string,
    now: Date
  ): Promise<IWeeklyReviewSendRow | null> {
    await this._ensureIndex();
    const staleBefore = new Date(now.getTime() - WEEKLY_REVIEW_STALE_RESERVATION_MS);
    try {
      const doc = await this._sends().findOneAndUpdate(
        {
          studentId,
          weekKey: due.weekKey,
          $or: [
            { status: 'sending', reservedAt: { $lt: staleBefore } },
            { status: 'partial' },
            { status: 'failed', attempts: { $lt: WEEKLY_REVIEW_MAX_ATTEMPTS } },
          ],
        },
        {
          $set: {
            status: 'sending',
            reservedAt: now,
            dueAt: due.dueAt,
            localDate: due.localDate,
            timeZone,
          },
          $setOnInsert: { createdAt: now, deliveries: [] },
          $inc: { attempts: 1 },
        },
        { upsert: true, returnDocument: 'after' }
      );
      return doc ? toRow(doc) : null;
    } catch (err) {
      if (isDuplicateKey(err)) return null;
      throw err;
    }
  }

  private async _recordFailure(
    studentId: string,
    weekKey: string,
    attempts: number,
    now: Date,
    err: unknown
  ): Promise<void> {
    await this._sends()
      .updateOne(
        { studentId, weekKey },
        { $set: { status: 'failed', lastError: errorMessage(err), failedAt: now } }
      )
      .catch(() => {
        /* best effort; the stale-reservation rule still frees the row later */
      });
    if (attempts >= WEEKLY_REVIEW_MAX_ATTEMPTS) {
      logger.error(
        { err, studentId, weekKey, attempts, job: 'weekly-review' },
        'weekly review failed; giving up for this week'
      );
    } else {
      logger.warn(
        { err, studentId, weekKey, attempts, job: 'weekly-review' },
        'weekly review attempt failed; will retry next tick'
      );
    }
  }
}

function payload(
  agentType: AgentType,
  studentId: string,
  userId: string,
  content: { readonly subject: string; readonly body: string },
  triggerData: Record<string, unknown>,
  channel: NotificationChannel
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
    channels: [channel],
  };
}
