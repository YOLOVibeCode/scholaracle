import { MongoClient, ObjectId, type Db } from 'mongodb';
import type {
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
} from '@scholaracle/interfaces';
import { MongoQueue } from '../queue/MongoQueue';
import type { NotificationService } from '../service/NotificationService';
import { NotificationWorker } from '../worker/NotificationWorker';
import { createMongoGuidanceProcessor } from './createMongoGuidanceProcessor';
import { enqueueGuidanceJobs } from './enqueueGuidanceJobs';

const HOUR_MS = 60 * 60 * 1000;
const TZ = 'America/Chicago';
const STUDENT_PORTAL_ID = 'portal-student-1';

/** Stands in for the real sink, which reads the household and queues a push and an email. */
class RecordingSink implements INotificationSink {
  public readonly sent: INotificationSinkMessage[] = [];

  public async send(message: INotificationSinkMessage): Promise<INotificationSinkResult> {
    this.sent.push(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { deliveries: 1 };
  }

  public to(audience: 'student' | 'parent'): string[] {
    return this.sent
      .filter((message) => message.audience === audience)
      .map((message) => message.assignmentExternalId ?? '')
      .sort();
  }
}

/**
 * The reminder ladder as the workers run it: the real queue, the real worker loop (ten jobs
 * at once) and the real Mongo-backed ladder. Only the sink is a stand-in.
 *
 * Every sync queues an assignment's coming reminders again (the scraper uploads every
 * assignment it sees, changed or not), so when a reminder comes due there is one copy of
 * its job for each sync since the assignment appeared.
 */
describe('a reminder that is due, with one copy of its job for every sync', () => {
  let client: MongoClient;
  let db: Db;
  let queue: MongoQueue;
  let sink: RecordingSink;
  let worker: NotificationWorker;
  let studentId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`reminder_goes_out_once_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    for (const name of [
      'jobs',
      'students',
      'users',
      'slc_assignments',
      'guidance_sends',
      'guidance_student_days',
    ]) {
      await db.collection(name).deleteMany({});
    }
    const ownerId = new ObjectId();
    const student = new ObjectId();
    studentId = student.toString();
    ownerUserId = ownerId.toString();
    await db.collection('users').insertOne({
      _id: ownerId,
      email: 'owner@example.com',
      role: 'parent',
      // Off, so the test reads the same at any hour of the day.
      preferences: { notifications: { quietHours: { enabled: false } } },
    });
    await db.collection('students').insertOne({
      _id: student,
      userId: ownerId.toString(),
      studentId: STUDENT_PORTAL_ID,
      name: 'Emma',
    });
    queue = new MongoQueue(db);
    sink = new RecordingSink();
    worker = new NotificationWorker(queue, {} as unknown as NotificationService, {
      pollIntervalMs: 20,
      concurrency: 10,
      processGuidanceJob: createMongoGuidanceProcessor(db, sink, queue),
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  /** An assignment that fell due twelve hours ago and is still not turned in. */
  async function seedAssignmentDueTwelveHoursAgo(externalId: string, dueAt: Date): Promise<void> {
    await db.collection('slc_assignments').insertOne({
      userId: ownerUserId,
      externalId,
      studentExternalId: STUDENT_PORTAL_ID,
      deletedAt: null,
      observedAt: new Date(),
      record: { title: `Lab ${externalId}`, dueAt: dueAt.toISOString(), status: 'missing' },
    });
  }

  /** What `syncs` syncs leave in the queue for one assignment, the last an hour before now. */
  async function queueAsSyncsDid(externalId: string, dueAt: Date, syncs: number): Promise<void> {
    // After the two before-due reminders, before the twelve-hours-after one: each sync
    // queues that one (due this instant) and the three-days-after one (not due yet).
    const lastSync = new Date(dueAt.getTime() + 11 * HOUR_MS);
    for (let i = 0; i < syncs; i += 1) {
      await enqueueGuidanceJobs(
        queue,
        {
          studentId,
          assignmentExternalId: externalId,
          title: `Lab ${externalId}`,
          dueAt,
          timezone: TZ,
        },
        new Date(lastSync.getTime() - i * 60_000)
      );
    }
  }

  async function runUntilNothingIsDue(): Promise<void> {
    worker.start();
    const deadline = Date.now() + 15_000;
    for (;;) {
      const waiting = await db.collection('jobs').countDocuments({
        type: 'guidance',
        status: { $in: ['pending', 'processing'] },
        scheduledFor: { $lte: new Date() },
      });
      if (waiting === 0) break;
      if (Date.now() > deadline) throw new Error(`${waiting} reminder jobs still waiting`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await worker.stop();
  }

  it('tells the student once and the parent once, not once for every copy', async () => {
    const dueAt = new Date(Date.now() - 12 * HOUR_MS);
    await seedAssignmentDueTwelveHoursAgo('lab-1', dueAt);
    await queueAsSyncsDid('lab-1', dueAt, 10);
    expect(await db.collection('jobs').countDocuments({ type: 'guidance', name: 't12h' })).toBe(10);

    await runUntilNothingIsDue();

    expect(sink.to('student')).toEqual(['lab-1']);
    expect(sink.to('parent')).toEqual(['lab-1']);
    expect(
      await db
        .collection('jobs')
        .countDocuments({ type: 'guidance', name: 't12h', status: 'completed' })
    ).toBe(10);
  }, 30_000);

  it('keeps to two reminders a day for the student when three assignments fell due together', async () => {
    const dueAt = new Date(Date.now() - 12 * HOUR_MS);
    for (const externalId of ['lab-1', 'lab-2', 'lab-3']) {
      await seedAssignmentDueTwelveHoursAgo(externalId, dueAt);
      await queueAsSyncsDid(externalId, dueAt, 1);
    }

    await runUntilNothingIsDue();

    expect(sink.to('student')).toHaveLength(2);
    // The limit is the student's. The parent hears about all three.
    expect(sink.to('parent')).toEqual(['lab-1', 'lab-2', 'lab-3']);
  }, 30_000);
});
