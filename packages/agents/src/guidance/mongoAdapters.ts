import type { Collection, Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  AssignmentLadderStatus,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSend,
  IGuidanceSendLog,
} from '@scholaracle/interfaces';
import { calendarDayKey } from '@scholaracle/studio-core';

export class MongoAssignmentState implements IAssignmentState {
  public constructor(private readonly _db: Db) {}

  public async status(
    studentId: string,
    assignmentExternalId: string
  ): Promise<AssignmentLadderStatus> {
    const student = await this._db.collection('students').findOne({ _id: new ObjectId(studentId) });
    if (student === null) return 'unknown';
    const external = student['studentId'] as string | undefined;
    const or: Record<string, unknown>[] = [{ studentId }];
    if (external !== undefined && external !== '') {
      or.push({ studentExternalId: external });
    }
    const doc = await this._db.collection('slc_assignments').findOne({
      deletedAt: null,
      externalId: assignmentExternalId,
      $or: or,
    });
    const raw = (doc?.['record'] as { status?: string } | undefined)?.status;
    if (raw === 'submitted' || raw === 'graded' || raw === 'missing') return raw;
    return 'unknown';
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
        _id: rowId(send.studentId, send.assignmentExternalId, send.step, send.audience),
        studentId: send.studentId,
        assignmentExternalId: send.assignmentExternalId,
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
    await this._sends().deleteOne({
      _id: rowId(send.studentId, send.assignmentExternalId, send.step, send.audience),
    });
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
