import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AgentType, NotificationChannel, type INotificationPayload } from '@scholaracle/contracts';
import { Student, type IStudentData } from '@scholaracle/database';
import {
  WEEKLY_REVIEW_SENDS_COLLECTION,
  WeeklyReviewSender,
  type IWeeklyReviewQueue,
} from './WeeklyReviewSender';

interface IJobRecord {
  readonly type: string;
  readonly name: string;
  readonly payload: INotificationPayload;
  readonly channel: NotificationChannel;
  readonly maxAttempts?: number;
}

class FakeQueue implements IWeeklyReviewQueue {
  public readonly jobs: IJobRecord[] = [];
  public failNext = false;

  public async add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('queue down');
    }
    this.jobs.push({
      type,
      name,
      payload: data['notificationPayload'] as INotificationPayload,
      channel: data['channel'] as NotificationChannel,
      maxAttempts: options?.maxAttempts,
    });
    return `job-${this.jobs.length}`;
  }
}

/** Sun Nov 8 2026, 18:05 in America/Chicago (CST, UTC-6). */
const SUNDAY_1805_CHICAGO = new Date('2026-11-09T00:05:00.000Z');
/** Sun Nov 8 2026, 17:30 in America/Chicago: not yet due. */
const SUNDAY_1730_CHICAGO = new Date('2026-11-08T23:30:00.000Z');
const DAY_MS = 86_400_000;

interface IHouseholdOptions {
  readonly ownerTimeZone?: string;
  readonly studentTimeZone?: string;
  readonly alertEmail?: string;
  readonly withLogin?: boolean;
  readonly withDevice?: boolean;
  readonly ownerAlertPrefs?: IStudentData['ownerAlertPrefs'];
  readonly sharedWith?: IStudentData['sharedWith'];
  readonly name?: string;
}

interface IHousehold {
  readonly ownerId: ObjectId;
  readonly studentId: ObjectId;
  readonly studentUserId: ObjectId;
}

describe('WeeklyReviewSender', () => {
  let client: MongoClient;
  let db: Db;
  let queue: FakeQueue;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`weekly_review_sender_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    queue = new FakeQueue();
    for (const name of [
      'students',
      'users',
      'slc_assignments',
      'slc_courses',
      'slc_course_materials',
      'slc_assets',
      WEEKLY_REVIEW_SENDS_COLLECTION,
    ]) {
      await db.collection(name).deleteMany({});
    }
  });

  async function seedHousehold(options: IHouseholdOptions = {}): Promise<IHousehold> {
    const ownerId = new ObjectId();
    const studentId = new ObjectId();
    const studentUserId = new ObjectId();
    const withLogin = options.withLogin ?? true;
    const withDevice = options.withDevice ?? true;
    const now = new Date();
    await db.collection('users').insertOne({
      _id: ownerId,
      email: 'owner@example.com',
      name: 'Ricardo Owner',
      phone: '+15125550100',
      role: 'parent',
      ...(options.ownerTimeZone !== undefined ? { timezone: options.ownerTimeZone } : {}),
    });
    await db.collection('students').insertOne({
      _id: studentId,
      userId: ownerId.toString(),
      name: options.name ?? 'Gideon Vega',
      studentId: `S-${studentId.toString().slice(-4)}`,
      dataSources: [],
      ...(withLogin
        ? { studentLogin: { userId: studentUserId.toString(), showGrades: false, createdAt: now } }
        : {}),
      ...(options.alertEmail !== undefined ? { alertEmail: options.alertEmail } : {}),
      ...(options.ownerAlertPrefs !== undefined
        ? { ownerAlertPrefs: options.ownerAlertPrefs }
        : {}),
      ...(options.sharedWith !== undefined ? { sharedWith: options.sharedWith } : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (withLogin) {
      await db.collection('users').insertOne({
        _id: studentUserId,
        email: `student-${studentUserId.toString()}@logins.example`,
        name: options.name ?? 'Gideon Vega',
        role: 'student',
        studentId: studentId.toString(),
        devices: withDevice
          ? [
              {
                deviceId: 'phone-1',
                type: 'ios',
                pushToken: 'ExponentPushToken[gideon]',
                lastActive: now,
                audience: 'student',
              },
            ]
          : [],
        ...(options.studentTimeZone !== undefined ? { timezone: options.studentTimeZone } : {}),
      });
    }
    return { ownerId, studentId, studentUserId };
  }

  /** 1 missing, 2 due inside the week, 1 beyond it, 1 graded two days ago → owed 1, due 2, done 1. */
  async function seedWeek(
    home: IHousehold,
    now: Date,
    titles?: { missing?: string }
  ): Promise<void> {
    const userId = home.ownerId.toString();
    const studentId = home.studentId.toString();
    await db.collection('slc_courses').insertMany([
      { userId, deletedAt: null, externalId: 'math', record: { name: 'Math' } },
      { userId, deletedAt: null, externalId: 'eng', record: { name: 'English' } },
    ]);
    const iso = (offsetDays: number): string =>
      new Date(now.getTime() + offsetDays * DAY_MS).toISOString();
    const base = { userId, deletedAt: null, studentId, updatedAt: now };
    await db.collection('slc_assignments').insertMany([
      {
        ...base,
        externalId: 'a-missing',
        courseExternalId: 'math',
        record: { title: titles?.missing ?? 'Ch. 4 worksheet', status: 'missing', dueAt: iso(-3) },
      },
      {
        ...base,
        externalId: 'a-tomorrow',
        courseExternalId: 'eng',
        record: { title: 'Essay draft', status: 'assigned', dueAt: iso(1) },
      },
      {
        ...base,
        externalId: 'a-wed',
        courseExternalId: 'math',
        record: { title: 'Ch. 5 problems', status: 'assigned', dueAt: iso(3) },
      },
      {
        ...base,
        externalId: 'a-far',
        courseExternalId: 'math',
        record: { title: 'Far away project', status: 'assigned', dueAt: iso(20) },
      },
      {
        ...base,
        externalId: 'a-done',
        courseExternalId: 'math',
        record: { title: 'Quiz 2', status: 'graded', dueAt: iso(-4), gradedAt: iso(-2), score: 95 },
      },
    ]);
  }

  function sender(now: Date): WeeklyReviewSender {
    return new WeeklyReviewSender({
      database: db,
      queue,
      webOrigin: 'https://scholarmancy.test',
      now: () => now,
    });
  }

  async function sends(): Promise<Record<string, unknown>[]> {
    return db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).find({}).toArray();
  }

  it('sends once at Sunday 18:00 local: push to the student login, email to alertEmail, no adults', async () => {
    const home = await seedHousehold({
      ownerTimeZone: 'America/Chicago',
      alertEmail: 'gideon@school.example',
    });
    await seedWeek(home, SUNDAY_1805_CHICAGO);

    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result).toEqual({ considered: 1, sent: 1, noRecipients: 0, alreadySent: 0, failed: 0 });

    expect(queue.jobs.map((j) => [j.type, j.name, j.channel, j.maxAttempts])).toEqual([
      ['deliver', 'deliver-one', NotificationChannel.PUSH, 5],
      ['deliver', 'deliver-one', NotificationChannel.EMAIL, 5],
    ]);
    const push = queue.jobs[0]!.payload;
    expect(push).toMatchObject({
      agentType: AgentType.STUDENT,
      studentId: home.studentId.toString(),
      userId: home.studentUserId.toString(),
      subject: 'Your week',
      body: 'This week: 2 due · 1 still owed · you finished 1. Tap to see the plan.',
      triggerType: 'weekly_review',
      channels: [NotificationChannel.PUSH],
    });
    expect(push.triggerData).toMatchObject({
      studentId: home.studentId.toString(),
      weekKey: '2026-W45',
      due: 2,
      owed: 1,
      done: 1,
    });
    const email = queue.jobs[1]!.payload;
    expect(email).toMatchObject({
      agentType: AgentType.STUDENT,
      studentId: '',
      userId: 'gideon@school.example',
      subject: 'Your week: 2 due · 1 still owed · you finished 1',
      triggerType: 'weekly_review',
    });
    expect(email.body).toContain('Still owed: "Ch. 4 worksheet" (Math).');
    expect(email.body).toContain('https://scholarmancy.test/studio/week');
    expect(email.body).not.toMatch(/95|%/);

    const rows = await sends();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: home.studentId.toString(),
      weekKey: '2026-W45',
      localDate: '2026-11-08',
      timeZone: 'America/Chicago',
      status: 'sent',
    });
    expect((rows[0]!['dueAt'] as Date).toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('a second tick (and a third) sends nothing more: idempotent per (student, week)', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(queue.jobs).toHaveLength(1);

    const again = await sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 15 * 60_000)).runTick();
    expect(again).toMatchObject({ sent: 0, alreadySent: 1 });
    const later = await sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 3 * DAY_MS)).runTick();
    expect(later).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect(await sends()).toHaveLength(1);
  });

  it("waits for the student's local 18:00: 17:30 on Sunday sends nothing new, 18:05 does", async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1730_CHICAGO);
    // Last week's review already went out.
    await db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).insertOne({
      studentId: home.studentId.toString(),
      weekKey: '2026-W44',
      status: 'sent',
    });

    const early = await sender(SUNDAY_1730_CHICAGO).runTick();
    expect(early).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(queue.jobs).toHaveLength(0);

    const onTime = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(onTime).toMatchObject({ sent: 1, alreadySent: 0 });
    expect(queue.jobs).toHaveLength(1);
    expect((await sends()).map((r) => r['weekKey']).sort()).toEqual(['2026-W44', '2026-W45']);
  });

  it('each student on their own clock: Tokyo is due while Los Angeles is still Sunday morning', async () => {
    const tokyo = await seedHousehold({ ownerTimeZone: 'Asia/Tokyo', name: 'Aiko' });
    const la = await seedHousehold({ ownerTimeZone: 'America/Los_Angeles', name: 'Leo' });
    // 09:30Z = 18:30 Sunday in Tokyo, 01:30 Sunday in LA.
    const now = new Date('2026-11-08T09:30:00.000Z');
    await seedWeek(tokyo, now);
    await seedWeek(la, now);
    for (const home of [tokyo, la]) {
      await db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).insertOne({
        studentId: home.studentId.toString(),
        weekKey: '2026-W44',
        status: 'sent',
      });
    }

    const result = await sender(now).runTick();
    expect(result).toMatchObject({ considered: 2, sent: 1, alreadySent: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]!.payload.userId).toBe(tokyo.studentUserId.toString());
    const rows = await sends();
    expect(rows.find((r) => r['weekKey'] === '2026-W45')?.['studentId']).toBe(
      tokyo.studentId.toString()
    );
    expect(rows.find((r) => r['weekKey'] === '2026-W45')?.['timeZone']).toBe('Asia/Tokyo');
  });

  it("the student login's stored zone beats the owner's; neither stored → UTC; junk ignored", async () => {
    const mixed = await seedHousehold({
      ownerTimeZone: 'Asia/Tokyo',
      studentTimeZone: 'America/Los_Angeles',
    });
    const none = await seedHousehold({ withLogin: false, alertEmail: 'x@y.example' });
    const junk = await seedHousehold({ ownerTimeZone: 'Mars/Olympus' });
    const s = sender(new Date());
    const load = async (id: ObjectId): Promise<Student> => {
      const doc = await db.collection('students').findOne({ _id: id });
      return new Student(doc as unknown as IStudentData, id);
    };
    expect(await s.resolveTimeZone(await load(mixed.studentId))).toBe('America/Los_Angeles');
    expect(await s.resolveTimeZone(await load(none.studentId))).toBe('UTC');
    expect(await s.resolveTimeZone(await load(junk.studentId))).toBe('UTC');
  });

  it('catch-up after downtime: a Tuesday tick sends the missed Sunday review once, not per tick', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    const tuesday = new Date('2026-11-10T15:00:00.000Z');
    await seedWeek(home, tuesday);

    const first = await sender(tuesday).runTick();
    expect(first).toMatchObject({ sent: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect((await sends())[0]).toMatchObject({ weekKey: '2026-W45', localDate: '2026-11-08' });

    // The ticks that would have run while down all collapse into that one send.
    for (let i = 1; i <= 4; i += 1) {
      const r = await sender(new Date(tuesday.getTime() + i * 15 * 60_000)).runTick();
      expect(r).toMatchObject({ sent: 0, alreadySent: 1 });
    }
    expect(queue.jobs).toHaveLength(1);
  });

  it('an empty week says "You\'re caught up."', async () => {
    const home = await seedHousehold({
      ownerTimeZone: 'America/Chicago',
      alertEmail: 'gideon@school.example',
    });
    await sender(SUNDAY_1805_CHICAGO).runTick();
    const push = queue.jobs.find((j) => j.channel === NotificationChannel.PUSH)!.payload;
    expect(push.body).toBe("You're caught up.");
    expect(push.studentId).toBe(home.studentId.toString());
    const email = queue.jobs.find((j) => j.channel === NotificationChannel.EMAIL)!.payload;
    expect(email.subject).toBe("You're caught up, Gideon");
  });

  it('adults get a copy only when their toggle is on, by their own channels', async () => {
    const home = await seedHousehold({
      ownerTimeZone: 'America/Chicago',
      ownerAlertPrefs: {
        receiveAlerts: true,
        alertChannels: ['email', 'sms'],
        weeklyReviewCopy: true,
      },
      sharedWith: [
        {
          email: 'texts-only@example.com',
          name: 'Tex',
          role: 'guardian',
          status: 'accepted',
          invitedAt: new Date(),
          phone: '+15125550199',
          alertChannels: ['sms'],
          weeklyReviewCopy: true,
        },
        {
          email: 'quiet@example.com',
          role: 'parent',
          status: 'accepted',
          invitedAt: new Date(),
          alertChannels: ['email'],
        },
        {
          email: 'pending@example.com',
          role: 'parent',
          status: 'pending',
          invitedAt: new Date(),
          weeklyReviewCopy: true,
        },
      ],
    });
    await seedWeek(home, SUNDAY_1805_CHICAGO);

    await sender(SUNDAY_1805_CHICAGO).runTick();
    const adults = queue.jobs.filter((j) => j.payload.agentType === AgentType.PARENT);
    expect(adults.map((j) => [j.channel, j.payload.userId])).toEqual([
      [NotificationChannel.EMAIL, 'owner@example.com'],
      [NotificationChannel.SMS, '+15125550100'],
      [NotificationChannel.SMS, '+15125550199'],
    ]);
    for (const job of adults) {
      expect(job.payload).toMatchObject({
        studentId: home.studentId.toString(),
        subject: "Gideon's week: 2 due · 1 still owed · 1 finished",
        triggerType: 'weekly_review',
      });
      expect(job.payload.body).toContain(
        `https://scholarmancy.test/dashboard/students/${home.studentId.toString()}`
      );
      expect(job.payload.body).not.toMatch(/95|%/);
      expect(job.payload.triggerData).toMatchObject({ studentName: 'Gideon Vega', due: 2 });
    }
    // The student's own push still goes out first.
    expect(queue.jobs[0]!.payload.agentType).toBe(AgentType.STUDENT);
    expect(queue.jobs).toHaveLength(4);
  });

  it('nobody to tell: records the week as no_recipients and enqueues nothing', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago', withDevice: false });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result).toMatchObject({ considered: 1, sent: 0, noRecipients: 1 });
    expect(queue.jobs).toHaveLength(0);
    expect((await sends())[0]).toMatchObject({ status: 'no_recipients' });
  });

  it('students with no login, no alertEmail and no adult copy are not even considered', async () => {
    await seedHousehold({ withLogin: false });
    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result.considered).toBe(0);
  });

  it('a failed enqueue releases the reservation so the next tick retries', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    queue.failNext = true;
    const failed = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(failed).toMatchObject({ failed: 1, sent: 0 });
    expect(await sends()).toHaveLength(0);

    const retry = await sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 15 * 60_000)).runTick();
    expect(retry).toMatchObject({ sent: 1 });
    expect(queue.jobs).toHaveLength(1);
  });

  it('fails closed on a grade leak: a title carrying a score sends nothing', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO, { missing: 'Quiz retake (scored 95%)' });
    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result).toMatchObject({ failed: 1, sent: 0 });
    expect(queue.jobs).toHaveLength(0);
    expect(await sends()).toHaveLength(0);
  });
});
