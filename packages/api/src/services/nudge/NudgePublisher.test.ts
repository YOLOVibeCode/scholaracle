import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db, type Document, type Filter, type UpdateFilter } from 'mongodb';
import { UserRepository, StudentRepository } from '@scholaracle/database';
import { ConflictError, RateLimitError } from '@scholaracle/contracts';
import type {
  IGuidanceClock,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
} from '@scholaracle/interfaces';
import { NudgePublisher } from './NudgePublisher';

class FakeClock implements IGuidanceClock {
  public constructor(public nowDate: Date) {}
  public now(): Date {
    return this.nowDate;
  }
  public localHour(): number {
    return 16;
  }
}

class FakeSink implements INotificationSink {
  public readonly sent: INotificationSinkMessage[] = [];
  public async send(input: INotificationSinkMessage): Promise<INotificationSinkResult> {
    this.sent.push({ ...input });
    return { deliveries: 1 };
  }
}

describe('NudgePublisher', () => {
  jest.setTimeout(60_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let students: StudentRepository;
  let users: UserRepository;
  let studentId: string;
  let parentUserId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('nudge-unit');
    students = new StudentRepository(database);
    users = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('students').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});
    const parent = await users.create({
      email: `parent-${Date.now()}@example.com`,
      passwordHash: 'hash',
      name: 'Parent',
      timezone: 'America/New_York',
    });
    parentUserId = parent._id?.toString() ?? '';
    const student = await students.create({
      userId: parentUserId,
      name: 'Emma',
      studentId: 'demo-emma',
    });
    studentId = student._id?.toString() ?? '';
    await database.collection('slc_assignments').insertOne({
      userId: parentUserId,
      studentExternalId: 'demo-emma',
      externalId: 'demo-emma-ap-bio-a5',
      deletedAt: null,
      record: { title: 'Cell Division', status: 'missing' },
    });
  });

  it('sends student-only and records lastNudgedAt', async () => {
    const sink = new FakeSink();
    const now = new Date('2026-08-25T18:00:00.000Z');
    const publisher = new NudgePublisher({
      database,
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(now),
    });
    await publisher.nudge(studentId, 'demo-emma-ap-bio-a5');
    expect(sink.sent).toEqual([
      expect.objectContaining({
        audience: 'student',
        body: expect.stringContaining('Cell Division'),
      }),
    ]);
    // The student, the page to open and the assignment: what a push needs to land on it.
    expect(sink.sent[0]).toMatchObject({
      studentId,
      deepLink: '/studio/assignments/demo-emma-ap-bio-a5',
      assignmentExternalId: 'demo-emma-ap-bio-a5',
    });
    const doc = await database.collection('slc_assignments').findOne({
      externalId: 'demo-emma-ap-bio-a5',
    });
    expect(doc?.['lastNudgedAt']).toEqual(now);
  });

  it('rate-limits to one nudge per assignment per calendar day', async () => {
    const sink = new FakeSink();
    const publisher = new NudgePublisher({
      database,
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(new Date('2026-08-25T18:00:00.000Z')),
    });
    await publisher.nudge(studentId, 'demo-emma-ap-bio-a5');
    await expect(publisher.nudge(studentId, 'demo-emma-ap-bio-a5')).rejects.toBeInstanceOf(
      RateLimitError
    );
    expect(sink.sent).toHaveLength(1);
  });

  it('allows another nudge the next calendar day in the parent timezone', async () => {
    const sink = new FakeSink();
    const first = new NudgePublisher({
      database,
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(new Date('2026-08-25T18:00:00.000Z')),
    });
    await first.nudge(studentId, 'demo-emma-ap-bio-a5');
    const nextDay = new NudgePublisher({
      database,
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(new Date('2026-08-26T08:00:00.000Z')),
    });
    await nextDay.nudge(studentId, 'demo-emma-ap-bio-a5');
    expect(sink.sent).toHaveLength(2);
  });

  /**
   * The database as two presses at the same moment see it: neither read of the assignment
   * returns until both have happened, so both see "not nudged yet" before either records.
   */
  function databaseWhereBothPressesReadFirst(): Db {
    const assignments = database.collection('slc_assignments');
    let reads = 0;
    let bothHaveRead: () => void = () => undefined;
    const bothRead = new Promise<void>((resolve) => {
      bothHaveRead = resolve;
    });
    const held = {
      findOne: async (filter: Filter<Document>): Promise<Document | null> => {
        const doc = await assignments.findOne(filter);
        reads += 1;
        if (reads >= 2) bothHaveRead();
        await bothRead;
        return doc;
      },
      updateOne: (filter: Filter<Document>, update: UpdateFilter<Document>) =>
        assignments.updateOne(filter, update),
    };
    return {
      collection: (name: string) => (name === 'slc_assignments' ? held : database.collection(name)),
    } as unknown as Db;
  }

  it('sends one nudge when the button is pressed twice at the same moment', async () => {
    const sink = new FakeSink();
    const publisher = new NudgePublisher({
      database: databaseWhereBothPressesReadFirst(),
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(new Date('2026-08-25T18:00:00.000Z')),
    });

    const presses = await Promise.allSettled([
      publisher.nudge(studentId, 'demo-emma-ap-bio-a5'),
      publisher.nudge(studentId, 'demo-emma-ap-bio-a5'),
    ]);

    expect(presses.map((p) => p.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refused = presses.find((p) => p.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(RateLimitError);
    expect(sink.sent).toHaveLength(1);
  });

  it('links to the worksheet even when the assignment id has a space or a slash in it', async () => {
    await database.collection('slc_assignments').insertOne({
      userId: parentUserId,
      studentExternalId: 'demo-emma',
      externalId: 'bio 101/lab #2',
      deletedAt: null,
      record: { title: 'Lab 2', status: 'missing' },
    });
    const sink = new FakeSink();
    const publisher = new NudgePublisher({
      database,
      studentRepository: students,
      userRepository: users,
      sink,
      clock: new FakeClock(new Date('2026-08-25T18:00:00.000Z')),
    });

    await publisher.nudge(studentId, 'bio 101/lab #2');

    expect(sink.sent[0]).toMatchObject({
      deepLink: '/studio/assignments/bio%20101%2Flab%20%232',
      assignmentExternalId: 'bio 101/lab #2',
    });
  });

  describe('when there is nobody to send the nudge to', () => {
    // What the real sender answers for a student with no login: nothing queued.
    const nobody: INotificationSink = {
      async send(): Promise<INotificationSinkResult> {
        return { deliveries: 0 };
      },
    };

    it('refuses, says what to do about it, and records nothing', async () => {
      const publisher = new NudgePublisher({
        database,
        studentRepository: students,
        userRepository: users,
        sink: nobody,
        clock: new FakeClock(new Date('2026-08-25T18:00:00.000Z')),
      });

      const attempt = publisher.nudge(studentId, 'demo-emma-ap-bio-a5');

      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      await expect(attempt).rejects.toThrow(
        'Emma has no student login to send a nudge to. Create one under Settings, Student logins.'
      );
      const doc = await database
        .collection('slc_assignments')
        .findOne({ externalId: 'demo-emma-ap-bio-a5' });
      // Otherwise the board would read "Nudged just now" for a nudge nobody got.
      expect(doc?.['lastNudgedAt']).toBeUndefined();
    });

    it('lets the parent nudge the same day once the student can be reached', async () => {
      const at = (now: string, sink: INotificationSink): NudgePublisher =>
        new NudgePublisher({
          database,
          studentRepository: students,
          userRepository: users,
          sink,
          clock: new FakeClock(new Date(now)),
        });
      await expect(
        at('2026-08-25T18:00:00.000Z', nobody).nudge(studentId, 'demo-emma-ap-bio-a5')
      ).rejects.toBeInstanceOf(ConflictError);

      const sink = new FakeSink();
      await at('2026-08-25T18:10:00.000Z', sink).nudge(studentId, 'demo-emma-ap-bio-a5');

      expect(sink.sent).toHaveLength(1);
    });
  });

  describe('when the nudge could not be sent', () => {
    const failing: INotificationSink = {
      async send(): Promise<INotificationSinkResult> {
        throw new Error('queue is down');
      },
    };

    function publisherAt(now: string, sink: INotificationSink): NudgePublisher {
      return new NudgePublisher({
        database,
        studentRepository: students,
        userRepository: users,
        sink,
        clock: new FakeClock(new Date(now)),
      });
    }

    async function lastNudgedAt(): Promise<unknown> {
      const doc = await database
        .collection('slc_assignments')
        .findOne({ externalId: 'demo-emma-ap-bio-a5' });
      return doc?.['lastNudgedAt'];
    }

    it('says so, and does not use up the one nudge of the day', async () => {
      await expect(
        publisherAt('2026-08-25T18:00:00.000Z', failing).nudge(studentId, 'demo-emma-ap-bio-a5')
      ).rejects.toThrow('queue is down');
      // The board would otherwise read "Nudged just now" for a nudge nobody got.
      expect(await lastNudgedAt()).toBeUndefined();

      const sink = new FakeSink();
      await publisherAt('2026-08-25T18:05:00.000Z', sink).nudge(studentId, 'demo-emma-ap-bio-a5');
      expect(sink.sent).toHaveLength(1);
    });

    it('keeps the time of the last nudge that did go out', async () => {
      const yesterday = new Date('2026-08-24T18:00:00.000Z');
      await publisherAt(yesterday.toISOString(), new FakeSink()).nudge(
        studentId,
        'demo-emma-ap-bio-a5'
      );

      await expect(
        publisherAt('2026-08-25T18:00:00.000Z', failing).nudge(studentId, 'demo-emma-ap-bio-a5')
      ).rejects.toThrow('queue is down');

      expect(await lastNudgedAt()).toEqual(yesterday);
    });
  });
});
