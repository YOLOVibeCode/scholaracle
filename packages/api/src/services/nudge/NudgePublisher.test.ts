import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { UserRepository, StudentRepository } from '@scholaracle/database';
import { RateLimitError } from '@scholaracle/contracts';
import type { IGuidanceClock, INotificationSink } from '@scholaracle/interfaces';
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
  public readonly sent: Array<{ audience: 'student' | 'parent'; body: string }> = [];
  public async send(input: {
    readonly audience: 'student' | 'parent';
    readonly studentId: string;
    readonly body: string;
    readonly deepLink: string;
  }): Promise<void> {
    this.sent.push({ audience: input.audience, body: input.body });
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
});
