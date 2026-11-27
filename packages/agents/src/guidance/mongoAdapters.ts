import type { Collection, Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  AssignmentLadderStatus,
  IAssignmentNow,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSend,
  IGuidanceSendLog,
} from '@scholaracle/interfaces';
import { StudentRepository } from '@scholaracle/database';
import { calendarDayKey } from '@scholaracle/studio-core';
import { slcStudentFilter } from '../studio/slcStudentFilter';
import { CLOSED_STATUSES, MISSING_STATUSES, normalizeStatus } from '../studio/studioTaskClassify';

/**
 * The portal's status as the ladder needs it, read the way the student's own pages read it
 * (`studioTaskClassify`), so a reminder never contradicts what those pages show.
 */
function ladderStatus(raw: unknown): AssignmentLadderStatus {
  const status = normalizeStatus(raw);
  if (CLOSED_STATUSES.has(status)) return 'closed';
  if (MISSING_STATUSES.has(status)) return 'missing';
  return 'open';
}

/** A due time as ingest stores it (an ISO string). Null when there is none or it is not a time. */
function dueTime(raw: unknown): Date | null {
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * An assignment as the latest sync left it: the row ingest keeps in `slc_assignments`.
 *
 * It is found with the filter the student's own pages use (`slcStudentFilter`): the rows
 * of the student's owner, live ones only. So a reminder is about the work the student sees
 * listed, and another family's row can never answer for this one (portal ids are only
 * unique within one school's portal). A row the portal dropped has `deletedAt` set and
 * counts as gone.
 */
export class MongoAssignmentState implements IAssignmentState {
  private readonly _students: StudentRepository;

  public constructor(private readonly _db: Db) {
    this._students = new StudentRepository(_db);
  }

  public async current(
    studentId: string,
    assignmentExternalId: string
  ): Promise<IAssignmentNow | null> {
    if (!ObjectId.isValid(studentId)) return null;
    const student = await this._students.findById(studentId);
    if (student === null) return null;
    // Two sources can list the same work. The one seen last is how it stands now.
    const row = await this._db
      .collection('slc_assignments')
      .findOne(
        { ...slcStudentFilter(student), externalId: assignmentExternalId },
        { sort: { observedAt: -1 } }
      );
    if (row === null) return null;
    const record = (row['record'] ?? {}) as { status?: unknown; dueAt?: unknown };
    return { status: ladderStatus(record.status), dueAt: dueTime(record.dueAt) };
  }
}

/** One reminder that was taken to be sent. The id names it, so it can exist only once. */
interface ISendRow extends IGuidanceSend {
  readonly _id: string;
  readonly sentAt: Date;
}

/** How many ladder reminders a student has had on one day. One row a student a day. */
interface IStudentDayRow {
  readonly _id: string;
  readonly studentId: string;
  readonly dayKey: string;
  readonly count: number;
}

/** Mongo's error code for "a row with this id is already there". */
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY
  );
}

/**
 * A row id made of its parts. A JSON list, because portal ids are free text: whatever
 * characters one holds, the parts stay apart.
 */
function rowId(...parts: readonly string[]): string {
  return JSON.stringify(parts);
}

function sendRowId(send: IGuidanceSend): string {
  return rowId(
    send.studentId,
    send.assignmentExternalId,
    send.dueAt.toISOString(),
    send.step,
    send.audience
  );
}

/**
 * Who has been told what, kept in Mongo.
 *
 * Both collections are keyed by `_id`, which the database keeps unique on its own, so the
 * one-caller-only promise does not depend on an index somebody has to create first.
 */
export class MongoGuidanceSendLog implements IGuidanceSendLog {
  public constructor(
    private readonly _db: Db,
    private readonly _clock: IGuidanceClock,
    private readonly _timezone: string = 'America/New_York'
  ) {}

  public async claim(send: IGuidanceSend): Promise<boolean> {
    try {
      await this._sends().insertOne({
        _id: sendRowId(send),
        studentId: send.studentId,
        assignmentExternalId: send.assignmentExternalId,
        dueAt: send.dueAt,
        step: send.step,
        audience: send.audience,
        sentAt: this._clock.now(),
      });
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  public async release(send: IGuidanceSend): Promise<void> {
    await this._sends().deleteOne({ _id: sendRowId(send) });
  }

  public async claimStudentSendToday(studentId: string, limit: number): Promise<boolean> {
    if (limit <= 0) return false;
    const dayKey = calendarDayKey(this._clock.now(), this._timezone);
    const today = rowId(studentId, dayKey);
    const days = this._days();
    const takeOne = async (): Promise<boolean> => {
      const taken = await days.updateOne(
        { _id: today, count: { $lt: limit } },
        { $inc: { count: 1 } }
      );
      return taken.matchedCount === 1;
    };

    if (await takeOne()) return true;
    try {
      // Either today's row is full or there is none yet. Starting it settles which.
      await days.insertOne({ _id: today, studentId, dayKey, count: 1 });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    // The row is there: full, or started by another caller a moment ago.
    return takeOne();
  }

  public async releaseStudentSendToday(studentId: string): Promise<void> {
    const dayKey = calendarDayKey(this._clock.now(), this._timezone);
    await this._days().updateOne(
      { _id: rowId(studentId, dayKey), count: { $gt: 0 } },
      { $inc: { count: -1 } }
    );
  }

  private _sends(): Collection<ISendRow> {
    return this._db.collection<ISendRow>('guidance_sends');
  }

  private _days(): Collection<IStudentDayRow> {
    return this._db.collection<IStudentDayRow>('guidance_student_days');
  }
}

export async function loadQuietHoursForStudent(
  db: Db,
  studentId: string
): Promise<{ start: string; end: string } | undefined> {
  if (!ObjectId.isValid(studentId)) return undefined;
  const student = await db.collection('students').findOne({ _id: new ObjectId(studentId) });
  if (student === null) return undefined;
  const userId = student['userId'];
  const parent = await db.collection('users').findOne({
    _id: typeof userId === 'string' ? new ObjectId(userId) : userId,
  });
  const quiet = (
    parent?.['preferences'] as
      | {
          notifications?: { quietHours?: { enabled?: boolean; start?: string; end?: string } };
        }
      | undefined
  )?.notifications?.quietHours;
  if (quiet?.enabled !== true || typeof quiet.start !== 'string' || typeof quiet.end !== 'string') {
    return undefined;
  }
  return { start: quiet.start, end: quiet.end };
}
