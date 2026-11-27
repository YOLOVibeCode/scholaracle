import { MongoClient, ObjectId, type Db } from 'mongodb';
import type {
  IGuidanceClock,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
} from '@scholaracle/interfaces';
import { MongoQueue, type IJob } from '../queue/MongoQueue';
import { createMongoGuidanceProcessor } from './createMongoGuidanceProcessor';
import { enqueueGuidanceJobs } from './enqueueGuidanceJobs';

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'America/Chicago';
const STUDENT_PORTAL_ID = 'portal-student-1';

/** Thursday 3 December 2026, 11:59 pm in Chicago: the usual deadline on a school portal. */
const THURSDAY_1159PM = new Date('2026-12-04T05:59:00.000Z');
/** The Monday after, 11:59 pm. */
const MONDAY_1159PM = new Date('2026-12-08T05:59:00.000Z');

/** A clock the test sets to the moment each job is due. */
class SetClock implements IGuidanceClock {
  public nowDate = new Date(0);
  public now(): Date {
    return this.nowDate;
  }
}

class RecordingSink implements INotificationSink {
  public readonly sent: Array<{ readonly to: string; readonly body: string; readonly at: string }> =
    [];
  public constructor(private readonly _clock: IGuidanceClock) {}

  public async send(message: INotificationSinkMessage): Promise<INotificationSinkResult> {
    this.sent.push({
      to: message.audience,
      body: message.body,
      at: this._clock.now().toISOString(),
    });
    return { deliveries: 1 };
  }

  public whoAndWhen(): Array<readonly [string, string]> {
    return this.sent.map((message) => [message.to, message.at] as const);
  }
}

/**
 * The scheduler (run by the API on every sync) and the ladder (run by the workers when a job
 * is due) have to agree on when each reminder goes: a job that runs at the time the scheduler
 * gave it must be sent. Real queue, real database, and the function the workers run for each
 * job; only the clock and the sink are stand-ins.
 */
describe('reminders queued by a sync, each run at the time it was scheduled for', () => {
  let client: MongoClient;
  let db: Db;
  let queue: MongoQueue;
  let clock: SetClock;
  let sink: RecordingSink;
  let run: (job: IJob) => Promise<void>;
  let ownerId: ObjectId;
  let studentId: string;
  let ran: Set<string>;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`reminder_runs_when_scheduled_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    for (const name of [
      'jobs',
      'users',
      'students',
      'slc_assignments',
      'guidance_sends',
      'guidance_student_days',
    ]) {
      await db.collection(name).deleteMany({});
    }
    ownerId = new ObjectId();
    const student = new ObjectId();
    studentId = student.toString();
    await db.collection('users').insertOne({
      _id: ownerId,
      email: 'owner@example.test',
      preferences: { notifications: { quietHours: { enabled: false } } },
    });
    await db.collection('students').insertOne({
      _id: student,
      userId: ownerId,
      studentId: STUDENT_PORTAL_ID,
      name: 'Emma',
    });
    queue = new MongoQueue(db);
    clock = new SetClock();
    sink = new RecordingSink(clock);
    run = createMongoGuidanceProcessor(db, sink, queue, clock);
    ran = new Set<string>();
  });

  /** The setting a new account is given: no reminders between 10 pm and 7 am. */
  async function ownerKeepsTheDefaultQuietHours(): Promise<void> {
    await db.collection('users').updateOne(
      { _id: ownerId },
      {
        $set: {
          'preferences.notifications.quietHours': {
            enabled: true,
            start: '22:00',
            end: '07:00',
            criticalOverride: true,
          },
        },
      }
    );
  }

  /**
   * What a sync leaves behind: the assignment's row as the portal has it now, and a job for
   * each reminder still to come. `at` is when the sync ran; a week ahead when not given.
   */
  async function syncSees(
    externalId: string,
    title: string,
    dueAt: Date,
    at: Date = new Date(dueAt.getTime() - 7 * DAY_MS)
  ): Promise<void> {
    await db.collection('slc_assignments').updateOne(
      { userId: ownerId.toString(), externalId, studentExternalId: STUDENT_PORTAL_ID },
      {
        $set: {
          deletedAt: null,
          observedAt: at,
          record: { title, dueAt: dueAt.toISOString(), status: 'missing' },
        },
      },
      { upsert: true }
    );
    await enqueueGuidanceJobs(
      queue,
      { studentId, assignmentExternalId: externalId, title, dueAt, timezone: TZ },
      at
    );
  }

  /**
   * Runs the queued reminder jobs in order, each at the moment it was scheduled for,
   * including any a held reminder queued for later. Stops before `until` when given.
   */
  async function runEachJobWhenItIsDue(until?: Date): Promise<void> {
    for (;;) {
      const waiting = await db
        .collection<IJob>('jobs')
        .find({ type: 'guidance' })
        .sort({ scheduledFor: 1, _id: 1 })
        .toArray();
      const job = waiting.find((candidate) => !ran.has(candidate._id.toString()));
      if (job === undefined) return;
      if (until !== undefined && job.scheduledFor.getTime() >= until.getTime()) return;
      ran.add(job._id.toString());
      clock.nowDate = job.scheduledFor;
      await run(job);
    }
  }

  it('sends all four for work due at 11:59 pm', async () => {
    await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);

    await runEachJobWhenItIsDue();

    expect(sink.sent).toEqual([
      {
        to: 'student',
        body: 'Cell Division is due Thursday. Open the worksheet when you have 15 min.',
        at: '2026-12-01T22:00:00.000Z', // Tuesday 4 pm
      },
      {
        to: 'student',
        body: "Cell Division is due soon. Open it now so it isn't last-minute.",
        at: '2026-12-03T22:00:00.000Z', // Thursday 4 pm
      },
      { to: 'student', body: 'Still open — tap to pick it up.', at: '2026-12-04T17:59:00.000Z' },
      { to: 'parent', body: 'Cell Division is still missing.', at: '2026-12-04T17:59:00.000Z' },
      {
        to: 'parent',
        body: 'Cell Division is still outstanding. Worth a short check-in.',
        at: '2026-12-07T05:59:00.000Z', // Sunday 11:59 pm
      },
    ]);
  });

  it.each([
    ['8 am, the start of class', '2026-12-03T14:00:00.000Z'],
    ['noon', '2026-12-03T18:00:00.000Z'],
    ['3 pm, the end of school', '2026-12-03T21:00:00.000Z'],
    ['6 pm', '2026-12-04T00:00:00.000Z'],
    ['11:59 pm the day after the clocks go forward', '2027-03-16T04:59:00.000Z'],
  ])('sends all four for work due at %s', async (_label, dueIso) => {
    await syncSees('essay-1', 'Essay', new Date(dueIso));

    await runEachJobWhenItIsDue();

    expect(sink.sent.map((message) => message.to)).toEqual([
      'student',
      'student',
      'student',
      'parent',
      'parent',
    ]);
  });

  it('sends each reminder once when five syncs each queued it', async () => {
    for (let sync = 0; sync < 5; sync += 1) {
      await syncSees(
        'bio-lab-2',
        'Cell Division',
        THURSDAY_1159PM,
        new Date(THURSDAY_1159PM.getTime() - (7 - sync) * DAY_MS)
      );
    }

    await runEachJobWhenItIsDue();

    expect(sink.whoAndWhen()).toEqual([
      ['student', '2026-12-01T22:00:00.000Z'],
      ['student', '2026-12-03T22:00:00.000Z'],
      ['student', '2026-12-04T17:59:00.000Z'],
      ['parent', '2026-12-04T17:59:00.000Z'],
      ['parent', '2026-12-07T05:59:00.000Z'],
    ]);
  });

  describe('for an owner who keeps the default quiet hours, 10 pm to 7 am', () => {
    beforeEach(async () => {
      await ownerKeepsTheDefaultQuietHours();
    });

    it('holds a reminder that falls in them until they end, instead of dropping it', async () => {
      // Three days after an 11:59 pm deadline is 11:59 pm.
      await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);

      await runEachJobWhenItIsDue();

      expect(sink.whoAndWhen()).toEqual([
        ['student', '2026-12-01T22:00:00.000Z'],
        ['student', '2026-12-03T22:00:00.000Z'],
        ['student', '2026-12-04T17:59:00.000Z'],
        ['parent', '2026-12-04T17:59:00.000Z'],
        ['parent', '2026-12-07T13:00:00.000Z'], // Monday 7 am, not Sunday 11:59 pm
      ]);
    });

    it('holds the twelve-hours-after reminder for a 3 pm deadline from 3 am until 7 am', async () => {
      await syncSees('essay-1', 'Essay', new Date('2026-12-03T21:00:00.000Z'));

      await runEachJobWhenItIsDue();

      expect(sink.whoAndWhen().slice(2)).toEqual([
        ['student', '2026-12-04T13:00:00.000Z'], // Friday 7 am, not 3 am
        ['parent', '2026-12-04T13:00:00.000Z'],
        ['parent', '2026-12-06T21:00:00.000Z'], // Sunday 3 pm
      ]);
    });

    it('sends a held reminder once when five syncs each queued it', async () => {
      for (let sync = 0; sync < 5; sync += 1) {
        await syncSees(
          'bio-lab-2',
          'Cell Division',
          THURSDAY_1159PM,
          new Date(THURSDAY_1159PM.getTime() - (7 - sync) * DAY_MS)
        );
      }

      await runEachJobWhenItIsDue();

      expect(sink.whoAndWhen().slice(4)).toEqual([['parent', '2026-12-07T13:00:00.000Z']]);
    });
  });

  describe('when the teacher moves the deadline from Thursday to the Monday after', () => {
    it('says nothing for the old deadline: the jobs queued for the new one speak for it', async () => {
      await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);
      await syncSees('bio-lab-2', 'Cell Division', MONDAY_1159PM, new Date('2026-11-28T12:00:00Z'));

      await runEachJobWhenItIsDue();

      expect(sink.sent).toEqual([
        {
          to: 'student',
          body: 'Cell Division is due Monday. Open the worksheet when you have 15 min.',
          at: '2026-12-05T22:00:00.000Z', // Saturday 4 pm
        },
        {
          to: 'student',
          body: "Cell Division is due soon. Open it now so it isn't last-minute.",
          at: '2026-12-07T22:00:00.000Z', // Monday 4 pm
        },
        { to: 'student', body: 'Still open — tap to pick it up.', at: '2026-12-08T17:59:00.000Z' },
        { to: 'parent', body: 'Cell Division is still missing.', at: '2026-12-08T17:59:00.000Z' },
        {
          to: 'parent',
          body: 'Cell Division is still outstanding. Worth a short check-in.',
          at: '2026-12-11T05:59:00.000Z',
        },
      ]);
    });

    it('reminds again for the new deadline when "due Thursday" had already gone out', async () => {
      await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);
      // Tuesday 4 pm: "due Thursday" goes out. On Wednesday the teacher gives everyone
      // until Monday, and that evening's sync sees it.
      const wednesdayEvening = new Date('2026-12-03T01:00:00.000Z');
      await runEachJobWhenItIsDue(wednesdayEvening);
      await syncSees('bio-lab-2', 'Cell Division', MONDAY_1159PM, wednesdayEvening);

      await runEachJobWhenItIsDue();

      expect(sink.sent.map((message) => [message.at, message.to, message.body])).toEqual([
        [
          '2026-12-01T22:00:00.000Z',
          'student',
          'Cell Division is due Thursday. Open the worksheet when you have 15 min.',
        ],
        [
          '2026-12-05T22:00:00.000Z',
          'student',
          'Cell Division is due Monday. Open the worksheet when you have 15 min.',
        ],
        [
          '2026-12-07T22:00:00.000Z',
          'student',
          "Cell Division is due soon. Open it now so it isn't last-minute.",
        ],
        ['2026-12-08T17:59:00.000Z', 'student', 'Still open — tap to pick it up.'],
        ['2026-12-08T17:59:00.000Z', 'parent', 'Cell Division is still missing.'],
        [
          '2026-12-11T05:59:00.000Z',
          'parent',
          'Cell Division is still outstanding. Worth a short check-in.',
        ],
      ]);
    });

    it('tells the parent it is missing after the new deadline, not after the old one', async () => {
      await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);
      const wednesdayEvening = new Date('2026-12-03T01:00:00.000Z');
      await runEachJobWhenItIsDue(wednesdayEvening);
      await syncSees('bio-lab-2', 'Cell Division', MONDAY_1159PM, wednesdayEvening);

      // Up to the new deadline: the old one's "is still missing" (Friday) and "still
      // outstanding" (Sunday night) both fall in here.
      await runEachJobWhenItIsDue(MONDAY_1159PM);

      expect(sink.sent.filter((message) => message.to === 'parent')).toEqual([]);
    });
  });

  it('says nothing about work the portal no longer lists', async () => {
    await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);
    await db
      .collection('slc_assignments')
      .updateOne({ externalId: 'bio-lab-2' }, { $set: { deletedAt: new Date() } });

    await runEachJobWhenItIsDue();

    expect(sink.sent).toEqual([]);
  });

  it('stops once the work is turned in', async () => {
    await syncSees('bio-lab-2', 'Cell Division', THURSDAY_1159PM);
    await runEachJobWhenItIsDue(new Date('2026-12-02T00:00:00.000Z'));
    await db
      .collection('slc_assignments')
      .updateOne({ externalId: 'bio-lab-2' }, { $set: { 'record.status': 'submitted' } });

    await runEachJobWhenItIsDue();

    expect(sink.whoAndWhen()).toEqual([['student', '2026-12-01T22:00:00.000Z']]);
  });
});
