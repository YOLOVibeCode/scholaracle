import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { IGuidanceClock, IGuidanceSend } from '@scholaracle/interfaces';
import { MongoAssignmentState, MongoGuidanceSendLog } from './mongoAdapters';

class FixedClock implements IGuidanceClock {
  public constructor(public nowDate: Date) {}
  public now(): Date {
    return this.nowDate;
  }
}

const STUDENT = '65f000000000000000000001';
/** Thursday 3 December 2026, 11:59 pm in Chicago. */
const DUE = new Date('2026-12-04T05:59:00.000Z');
const REMINDER: IGuidanceSend = {
  studentId: STUDENT,
  assignmentExternalId: 'bio-lab-2',
  dueAt: DUE,
  step: 't48h',
  audience: 'student',
};

function countTrue(answers: readonly boolean[]): number {
  return answers.filter(Boolean).length;
}

describe('MongoAssignmentState', () => {
  const OWNER = '65f0000000000000000000a1';
  const PORTAL_STUDENT = 'portal-student-1';
  let client: MongoClient;
  let db: Db;
  let state: MongoAssignmentState;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`guidance_assignment_state_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await db.collection('students').deleteMany({});
    await db.collection('slc_assignments').deleteMany({});
    await db.collection('students').insertOne({
      _id: new ObjectId(STUDENT),
      userId: new ObjectId(OWNER),
      studentId: PORTAL_STUDENT,
      name: 'Emma',
    });
    state = new MongoAssignmentState(db);
  });

  /** A row as ingest writes it: the owner's partition, the portal's ids, the portal's record. */
  async function synced(overrides: Record<string, unknown> = {}): Promise<void> {
    await db.collection('slc_assignments').insertOne({
      userId: OWNER,
      provider: 'canvas',
      adapterId: 'canvas-1',
      externalId: 'bio-lab-2',
      studentExternalId: PORTAL_STUDENT,
      observedAt: new Date('2026-11-30T12:00:00.000Z'),
      deletedAt: null,
      record: { title: 'Cell Division', status: 'missing', dueAt: DUE.toISOString() },
      ...overrides,
    });
  }

  it('reads the status and the due time the latest sync left', async () => {
    await synced();

    expect(await state.current(STUDENT, 'bio-lab-2')).toEqual({ status: 'missing', dueAt: DUE });
  });

  // Closed is what the student's own pages call closed (`studioTaskClassify`): finished
  // work, and excused work. Missing is the portal's own "missing" and nothing else. "Late"
  // is not it: Canvas, the one portal that reports it, means work handed in after the
  // deadline.
  it.each([
    ['submitted', 'closed'],
    ['graded', 'closed'],
    ['excused', 'closed'],
    [' Submitted ', 'closed'],
    ['missing', 'missing'],
    ['MISSING', 'missing'],
    ['late', 'open'],
    ['not_started', 'open'],
    ['in_progress', 'open'],
    ['unknown', 'open'],
    ['', 'open'],
    [undefined, 'open'],
    [42, 'open'],
  ])('reads a portal status of %p as %s', async (portal, expected) => {
    await synced({ record: { title: 'Cell Division', status: portal, dueAt: DUE.toISOString() } });

    expect((await state.current(STUDENT, 'bio-lab-2'))?.status).toBe(expected);
  });

  it.each([
    ['none at all', undefined],
    ['an empty one', ''],
    ['words', 'next week'],
    ['a number', 20261204],
  ])('says there is no due time when the portal gave %s', async (_label, dueAt) => {
    await synced({ record: { title: 'Cell Division', status: 'missing', dueAt } });

    expect(await state.current(STUDENT, 'bio-lab-2')).toEqual({ status: 'missing', dueAt: null });
  });

  it('says the work is gone when the portal no longer lists it', async () => {
    await synced({ deletedAt: new Date('2026-12-01T12:00:00.000Z') });

    expect(await state.current(STUDENT, 'bio-lab-2')).toBeNull();
  });

  it('says the work is gone when it was never synced', async () => {
    await synced({ externalId: 'another-assignment' });

    expect(await state.current(STUDENT, 'bio-lab-2')).toBeNull();
  });

  it("does not read another student's work with the same id", async () => {
    await synced({ studentExternalId: 'portal-student-2' });

    expect(await state.current(STUDENT, 'bio-lab-2')).toBeNull();
  });

  it("does not read another family's row, even with the same portal ids", async () => {
    // Ids are only unique within one school's portal: two portals can both have a student
    // "portal-student-1" with an assignment "bio-lab-2".
    await synced({
      userId: '65f0000000000000000000b2',
      observedAt: new Date('2026-12-02T12:00:00.000Z'),
      record: { title: 'Other school', status: 'submitted', dueAt: '2026-12-09T05:59:00.000Z' },
    });
    await synced();

    expect(await state.current(STUDENT, 'bio-lab-2')).toEqual({ status: 'missing', dueAt: DUE });
  });

  it('goes by the source that saw the work last when two list it', async () => {
    await synced({ observedAt: new Date('2026-11-30T12:00:00.000Z') });
    await synced({
      provider: 'district-portal',
      adapterId: 'district-1',
      observedAt: new Date('2026-12-01T12:00:00.000Z'),
      record: { title: 'Cell Division', status: 'submitted', dueAt: DUE.toISOString() },
    });

    expect((await state.current(STUDENT, 'bio-lab-2'))?.status).toBe('closed');
  });

  it('says the work is gone for a student who is', async () => {
    await synced();

    expect(await state.current('65f000000000000000000009', 'bio-lab-2')).toBeNull();
  });

  it('says the work is gone for an id that is not an id, without throwing', async () => {
    await synced();

    expect(await state.current('not-an-id', 'bio-lab-2')).toBeNull();
  });
});

describe('MongoGuidanceSendLog', () => {
  let client: MongoClient;
  let db: Db;
  let clock: FixedClock;
  let log: MongoGuidanceSendLog;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`guidance_send_log_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await db.collection('guidance_sends').deleteMany({});
    await db.collection('guidance_student_days').deleteMany({});
    clock = new FixedClock(new Date('2026-11-30T21:00:00.000Z'));
    log = new MongoGuidanceSendLog(db, clock);
  });

  describe('taking a reminder', () => {
    it('gives it to the first caller and refuses the next', async () => {
      expect(await log.claim(REMINDER)).toBe(true);
      expect(await log.claim(REMINDER)).toBe(false);
    });

    it('gives it to exactly one of twenty callers asking at the same moment', async () => {
      const answers = await Promise.all(Array.from({ length: 20 }, () => log.claim(REMINDER)));

      expect(countTrue(answers)).toBe(1);
      expect(await db.collection('guidance_sends').countDocuments({})).toBe(1);
    });

    it('keeps the student, the parent, each step and each assignment apart', async () => {
      expect(await log.claim(REMINDER)).toBe(true);

      expect(await log.claim({ ...REMINDER, audience: 'parent' })).toBe(true);
      expect(await log.claim({ ...REMINDER, step: 't18h' })).toBe(true);
      expect(await log.claim({ ...REMINDER, assignmentExternalId: 'bio-lab-3' })).toBe(true);
      expect(await log.claim({ ...REMINDER, studentId: '65f000000000000000000002' })).toBe(true);
    });

    it('treats the same step for a new due time as a new reminder', async () => {
      const monday = new Date('2026-12-08T05:59:00.000Z');
      expect(await log.claim(REMINDER)).toBe(true);

      expect(await log.claim({ ...REMINDER, dueAt: monday })).toBe(true);
      expect(await log.claim({ ...REMINDER, dueAt: monday })).toBe(false);
      // The same instant, however the date object was made.
      expect(await log.claim({ ...REMINDER, dueAt: new Date('2026-12-03T23:59:00-06:00') })).toBe(
        false
      );
    });

    it('takes a portal id as it comes: quotes, colons, spaces and slashes', async () => {
      for (const assignmentExternalId of ['a","t48h', 'a:t48h:student', 'bio 101/lab #2', 'a']) {
        expect(await log.claim({ ...REMINDER, assignmentExternalId })).toBe(true);
        expect(await log.claim({ ...REMINDER, assignmentExternalId })).toBe(false);
      }
      expect(await db.collection('guidance_sends').countDocuments({})).toBe(4);
    });

    it('records who it was for and when', async () => {
      await log.claim(REMINDER);

      const rows = await db.collection('guidance_sends').find({}).toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ ...REMINDER, sentAt: clock.now() });
    });

    it('can be taken again once it is given back', async () => {
      await log.claim(REMINDER);

      await log.release(REMINDER);

      expect(await db.collection('guidance_sends').countDocuments({})).toBe(0);
      expect(await log.claim(REMINDER)).toBe(true);
    });

    it('gives back only the one named', async () => {
      await log.claim(REMINDER);
      await log.claim({ ...REMINDER, audience: 'parent' });

      await log.release(REMINDER);

      expect(await log.claim({ ...REMINDER, audience: 'parent' })).toBe(false);
    });
  });

  describe("the student's reminders for the day", () => {
    it('allows as many as the limit and no more', async () => {
      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(true);
      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(true);
      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(false);
    });

    it('allows exactly two of ten callers asking at the same moment', async () => {
      const answers = await Promise.all(
        Array.from({ length: 10 }, () => log.claimStudentSendToday(STUDENT, 2))
      );

      expect(countTrue(answers)).toBe(2);
    });

    it("still gives a caller its turn when another started the day's row in between", async () => {
      // Two reminders come due together on a day with none yet. Both callers look and find
      // no row for today; one starts it. The other must not read that as "the day is full".
      const days = db.collection<{ _id: string }>('guidance_student_days');
      let anotherCallerHasGone = false;
      const racingDays = {
        updateOne: async (
          filter: Record<string, unknown>,
          update: Record<string, unknown>
        ): Promise<unknown> => {
          const looked = await days.updateOne(filter, update);
          if (!anotherCallerHasGone) {
            anotherCallerHasGone = true;
            expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(true);
          }
          return looked;
        },
        insertOne: (row: { _id: string }): Promise<unknown> => days.insertOne(row),
      };
      const racing = new MongoGuidanceSendLog(
        { collection: () => racingDays } as unknown as Db,
        clock
      );

      expect(await racing.claimStudentSendToday(STUDENT, 2)).toBe(true);

      expect(await db.collection('guidance_student_days').find({}).toArray()).toEqual([
        expect.objectContaining({ studentId: STUDENT, count: 2 }),
      ]);
      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(false);
    });

    it('allows none when the limit is zero', async () => {
      expect(await log.claimStudentSendToday(STUDENT, 0)).toBe(false);
    });

    it('counts each student apart', async () => {
      await log.claimStudentSendToday(STUDENT, 1);

      expect(await log.claimStudentSendToday('65f000000000000000000002', 1)).toBe(true);
    });

    it('frees one when it is given back', async () => {
      await log.claimStudentSendToday(STUDENT, 2);
      await log.claimStudentSendToday(STUDENT, 2);

      await log.releaseStudentSendToday(STUDENT);

      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(true);
      expect(await log.claimStudentSendToday(STUDENT, 2)).toBe(false);
    });

    it('never goes below none when more are given back than were taken', async () => {
      await log.releaseStudentSendToday(STUDENT);
      await log.claimStudentSendToday(STUDENT, 1);
      await log.releaseStudentSendToday(STUDENT);
      await log.releaseStudentSendToday(STUDENT);

      expect(await log.claimStudentSendToday(STUDENT, 1)).toBe(true);
      expect(await log.claimStudentSendToday(STUDENT, 1)).toBe(false);
    });

    it('starts again the next day', async () => {
      await log.claimStudentSendToday(STUDENT, 1);
      expect(await log.claimStudentSendToday(STUDENT, 1)).toBe(false);

      clock.nowDate = new Date('2026-12-01T21:00:00.000Z');

      expect(await log.claimStudentSendToday(STUDENT, 1)).toBe(true);
    });
  });
});
