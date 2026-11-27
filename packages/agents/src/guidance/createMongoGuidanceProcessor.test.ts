import { MongoClient, ObjectId, type Db } from 'mongodb';
import type {
  IGuidanceClock,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
  LadderStep,
} from '@scholaracle/interfaces';
import { MongoQueue, type IJob } from '../queue/MongoQueue';
import { logger } from '../logger';
import { createMongoGuidanceProcessor } from './createMongoGuidanceProcessor';

const TZ = 'America/Chicago';
/** Thursday 3 December 2026, 11:59 pm in Chicago. */
const DUE = new Date('2026-12-04T05:59:00.000Z');
const TUESDAY_4PM = new Date('2026-12-01T22:00:00.000Z');
const SUNDAY_1159PM = new Date('2026-12-07T05:59:00.000Z');
const MONDAY_7AM = new Date('2026-12-07T13:00:00.000Z');

class SetClock implements IGuidanceClock {
  public constructor(public nowDate: Date) {}
  public now(): Date {
    return this.nowDate;
  }
}

class RecordingSink implements INotificationSink {
  public readonly sent: Array<{ readonly to: string; readonly body: string }> = [];
  public async send(message: INotificationSinkMessage): Promise<INotificationSinkResult> {
    this.sent.push({ to: message.audience, body: message.body });
    return { deliveries: 1 };
  }
}

/**
 * The function the workers run for each `guidance` job, on a real database and a real
 * queue. Only the clock and the sink are stand-ins.
 */
describe('createMongoGuidanceProcessor', () => {
  let client: MongoClient;
  let db: Db;
  let queue: MongoQueue;
  let sink: RecordingSink;
  let studentId: string;
  let ownerId: ObjectId;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`guidance_processor_${process.pid}`);
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
      // What a new account is given: quiet from 10 pm to 7 am.
      preferences: {
        notifications: {
          quietHours: { enabled: true, start: '22:00', end: '07:00', criticalOverride: true },
        },
      },
    });
    await db.collection('students').insertOne({
      _id: student,
      userId: ownerId,
      studentId: 'portal-student-1',
      name: 'Emma',
    });
    await db.collection('slc_assignments').insertOne({
      userId: ownerId.toString(),
      externalId: 'bio-lab-2',
      studentExternalId: 'portal-student-1',
      observedAt: new Date('2026-11-27T12:00:00.000Z'),
      deletedAt: null,
      record: { title: 'Cell Division', status: 'missing', dueAt: DUE.toISOString() },
    });
    queue = new MongoQueue(db);
    sink = new RecordingSink();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Queues the job as a sync does, and returns it as the worker is handed it. */
  async function queued(step: LadderStep, scheduledFor: Date): Promise<IJob> {
    const id = await queue.add(
      'guidance',
      step,
      {
        studentId,
        assignmentExternalId: 'bio-lab-2',
        title: 'Cell Division',
        dueAt: DUE.toISOString(),
        timezone: TZ,
        step,
      },
      { scheduledFor }
    );
    const job = await db.collection<IJob>('jobs').findOne({ _id: new ObjectId(id) });
    if (job === null) throw new Error('the job was not queued');
    return job;
  }

  async function waitingJobs(): Promise<readonly IJob[]> {
    return db.collection<IJob>('jobs').find({}).sort({ scheduledFor: 1 }).toArray();
  }

  it('sends a reminder that runs at its time', async () => {
    const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(TUESDAY_4PM));

    await run(await queued('t48h', TUESDAY_4PM));

    expect(sink.sent).toEqual([
      {
        to: 'student',
        body: 'Cell Division is due Thursday. Open the worksheet when you have 15 min.',
      },
    ]);
    expect(await waitingJobs()).toHaveLength(1);
  });

  it("holds a reminder through the owner's quiet hours: a new job waits for 7 am", async () => {
    const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(SUNDAY_1159PM));
    const job = await queued('t72h', SUNDAY_1159PM);

    await run(job);

    expect(sink.sent).toEqual([]);
    const jobs = await waitingJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      type: 'guidance',
      name: 't72h',
      status: 'pending',
      scheduledFor: MONDAY_7AM,
      data: job.data,
    });
  });

  it('sends the held reminder when the new job runs at 7 am', async () => {
    const night = createMongoGuidanceProcessor(db, sink, queue, new SetClock(SUNDAY_1159PM));
    await night(await queued('t72h', SUNDAY_1159PM));
    const held = (await waitingJobs())[1];
    if (held === undefined) throw new Error('nothing was held');

    const morning = createMongoGuidanceProcessor(db, sink, queue, new SetClock(MONDAY_7AM));
    await morning(held);

    expect(sink.sent).toEqual([
      { to: 'parent', body: 'Cell Division is still outstanding. Worth a short check-in.' },
    ]);
    expect(await waitingJobs()).toHaveLength(2);
  });

  it('sends at any hour for an owner who turned quiet hours off', async () => {
    await db
      .collection('users')
      .updateOne(
        { _id: ownerId },
        { $set: { 'preferences.notifications.quietHours.enabled': false } }
      );
    const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(SUNDAY_1159PM));

    await run(await queued('t72h', SUNDAY_1159PM));

    expect(sink.sent.map((message) => message.to)).toEqual(['parent']);
    expect(await waitingJobs()).toHaveLength(1);
  });

  it.each(['submitted', 'graded', 'excused'])(
    'sends nothing once the portal has the work as %s',
    async (status) => {
      await db
        .collection('slc_assignments')
        .updateOne({ externalId: 'bio-lab-2' }, { $set: { 'record.status': status } });
      const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(TUESDAY_4PM));

      await run(await queued('t48h', TUESDAY_4PM));

      expect(sink.sent).toEqual([]);
      expect(await waitingJobs()).toHaveLength(1);
    }
  );

  it('fails the job when its payload is not a reminder, so the queue records the failure', async () => {
    const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(TUESDAY_4PM));
    const job = await queued('t48h', TUESDAY_4PM);

    await expect(run({ ...job, data: { ...job.data, step: 't24h' } })).rejects.toThrow(
      'Guidance job missing assignment payload'
    );
    await expect(run({ ...job, data: { ...job.data, studentId: 48 } })).rejects.toThrow(
      'Guidance job missing assignment payload'
    );
    expect(sink.sent).toEqual([]);
  });

  describe("what the workers' log says", () => {
    it('says a reminder was sent, with the step and no names or wording', async () => {
      const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(TUESDAY_4PM));
      const job = await queued('t48h', TUESDAY_4PM);

      await run(job);

      expect(info).toHaveBeenCalledWith(
        { job: 'guidance', jobId: job._id.toString(), step: 't48h' },
        'reminder sent'
      );
      expect(JSON.stringify(info.mock.calls)).not.toMatch(/Cell Division|Emma|bio-lab-2/);
    });

    it('says a reminder was held and until when', async () => {
      const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(SUNDAY_1159PM));
      const job = await queued('t72h', SUNDAY_1159PM);

      await run(job);

      expect(info).toHaveBeenCalledWith(
        {
          job: 'guidance',
          jobId: job._id.toString(),
          step: 't72h',
          until: '2026-12-07T13:00:00.000Z',
        },
        'reminder held until quiet hours end'
      );
    });

    it('keeps the routine case, a reminder not sent, at debug level with the reason', async () => {
      const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
      const debug = jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
      await db
        .collection('slc_assignments')
        .updateOne({ externalId: 'bio-lab-2' }, { $set: { 'record.status': 'graded' } });
      const run = createMongoGuidanceProcessor(db, sink, queue, new SetClock(TUESDAY_4PM));
      const job = await queued('t48h', TUESDAY_4PM);

      await run(job);

      expect(info).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(
        { job: 'guidance', jobId: job._id.toString(), step: 't48h', why: 'closed' },
        'reminder not sent'
      );
    });
  });
});
