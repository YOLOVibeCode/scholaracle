import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  AssignmentLadderStatus,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  LadderStep,
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

export class MongoGuidanceSendLog implements IGuidanceSendLog {
  public constructor(
    private readonly _db: Db,
    private readonly _clock: IGuidanceClock,
    private readonly _timezone: string = 'America/New_York'
  ) {}

  public async alreadySent(
    studentId: string,
    assignmentExternalId: string,
    step: LadderStep
  ): Promise<boolean> {
    const found = await this._db.collection('guidance_sends').findOne({
      studentId,
      assignmentExternalId,
      step,
    });
    return found !== null;
  }

  public async markSent(
    studentId: string,
    assignmentExternalId: string,
    step: LadderStep
  ): Promise<void> {
    await this._db
      .collection('guidance_sends')
      .updateOne(
        { studentId, assignmentExternalId, step },
        { $set: { studentId, assignmentExternalId, step, sentAt: this._clock.now() } },
        { upsert: true }
      );
  }

  public async studentLadderSendsToday(studentId: string): Promise<number> {
    const dayKey = calendarDayKey(this._clock.now(), this._timezone);
    const doc = await this._db.collection('guidance_student_days').findOne({ studentId, dayKey });
    return typeof doc?.['count'] === 'number' ? doc['count'] : 0;
  }

  public async recordStudentLadderSend(studentId: string): Promise<void> {
    const dayKey = calendarDayKey(this._clock.now(), this._timezone);
    await this._db
      .collection('guidance_student_days')
      .updateOne(
        { studentId, dayKey },
        { $inc: { count: 1 }, $set: { studentId, dayKey } },
        { upsert: true }
      );
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
