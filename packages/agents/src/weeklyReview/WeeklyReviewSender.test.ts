import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AgentType, NotificationChannel, type INotificationPayload } from '@scholaracle/contracts';
import type { IStudentData } from '@scholaracle/database';
import {
  WEEKLY_REVIEW_MAX_ATTEMPTS,
  WEEKLY_REVIEW_SENDS_COLLECTION,
  WEEKLY_REVIEW_STALE_RESERVATION_MS,
  WeeklyReviewSender,
  candidateWeekKeys,
  deliveryKey,
  isRowFinalForTick,
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
  /** 1-based index of the `add` call that throws; 0 = never. */
  public failOnCall = 0;
  private _calls = 0;

  public async add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string> {
    this._calls += 1;
    if (this._calls === this.failOnCall) {
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
const MINUTE_MS = 60_000;

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

  async function seedAdultUser(withDevice: boolean): Promise<ObjectId> {
    const id = new ObjectId();
    await db.collection('users').insertOne({
      _id: id,
      email: `adult-${id.toString()}@example.com`,
      name: 'Shared Adult',
      role: 'parent',
      devices: withDevice
        ? [
            {
              deviceId: 'adult-phone',
              type: 'android',
              pushToken: 'ExponentPushToken[adult]',
              lastActive: new Date(),
              audience: 'parent',
            },
          ]
        : [],
    });
    return id;
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

  function sentRow(home: IHousehold, weekKey: string, status = 'sent'): Record<string, unknown> {
    return { studentId: home.studentId.toString(), weekKey, status, attempts: 1, deliveries: [] };
  }

  it('sends once at Sunday 18:00 local: push to the student login, email to alertEmail, no adults', async () => {
    const home = await seedHousehold({
      ownerTimeZone: 'America/Chicago',
      alertEmail: 'gideon@school.example',
    });
    await seedWeek(home, SUNDAY_1805_CHICAGO);

    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result).toEqual({ considered: 1, sent: 1, noRecipients: 0, skipped: 0, failed: 0 });

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
      attempts: 1,
    });
    expect((rows[0]!['dueAt'] as Date).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    const deliveries = rows[0]!['deliveries'] as {
      key: string;
      enqueuedAt?: Date;
      jobId?: string;
    }[];
    expect(deliveries.map((d) => d.jobId)).toEqual(['job-1', 'job-2']);
    expect(deliveries.every((d) => d.enqueuedAt instanceof Date)).toBe(true);
    // Keys carry no address, only a hash.
    expect(deliveries[1]!.key).toBe(
      deliveryKey(NotificationChannel.EMAIL, 'student', 'gideon@school.example')
    );
    expect(JSON.stringify(deliveries)).not.toContain('gideon@school.example');
  });

  it('a second tick (and a third) sends nothing more and skips before any zone lookup', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(queue.jobs).toHaveLength(1);

    const again = sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 15 * MINUTE_MS));
    const zoneLookups = jest.spyOn(again, 'resolveTimeZone');
    expect(await again.runTick()).toMatchObject({ sent: 0, skipped: 1 });
    expect(zoneLookups).not.toHaveBeenCalled();

    const later = await sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 3 * DAY_MS)).runTick();
    expect(later).toMatchObject({ sent: 0, skipped: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect(await sends()).toHaveLength(1);
  });

  it("waits for the student's local 18:00: 17:30 on Sunday sends nothing new, 18:05 does", async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1730_CHICAGO);
    await db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).insertOne(sentRow(home, '2026-W44'));

    const early = await sender(SUNDAY_1730_CHICAGO).runTick();
    expect(early).toMatchObject({ sent: 0, skipped: 1 });
    expect(queue.jobs).toHaveLength(0);

    const onTime = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(onTime).toMatchObject({ sent: 1, skipped: 0 });
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
      await db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).insertOne(sentRow(home, '2026-W44'));
    }
    // Two possible week keys at this instant, so last week's row alone cannot settle anyone.
    expect([...candidateWeekKeys(now)].sort()).toEqual(['2026-W44', '2026-W45']);

    const result = await sender(now).runTick();
    expect(result).toMatchObject({ considered: 2, sent: 1, skipped: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]!.payload.userId).toBe(tokyo.studentUserId.toString());
    const rows = await sends();
    const fresh = rows.find((r) => r['weekKey'] === '2026-W45');
    expect(fresh?.['studentId']).toBe(tokyo.studentId.toString());
    expect(fresh?.['timeZone']).toBe('Asia/Tokyo');
  });

  it('candidateWeekKeys collapses to one key once every zone has passed the same Sunday', () => {
    expect(candidateWeekKeys(new Date('2026-11-11T12:00:00.000Z'))).toEqual(['2026-W45']);
    expect([...candidateWeekKeys(new Date('2026-11-08T04:00:00.000Z'))].sort()).toEqual([
      '2026-W44',
      '2026-W45',
    ]); // 18:00 Sunday at UTC+14 has just happened; nowhere else has
  });

  it("the zone rule is the API's: login zone → owner zone → America/New_York", async () => {
    const mixed = await seedHousehold({
      ownerTimeZone: 'Asia/Tokyo',
      studentTimeZone: 'America/Los_Angeles',
    });
    const none = await seedHousehold({ withLogin: false, alertEmail: 'x@y.example' });
    const junk = await seedHousehold({ ownerTimeZone: 'Mars/Olympus' });
    const s = sender(new Date());
    const load = async (id: ObjectId): Promise<Parameters<typeof s.resolveTimeZone>[0]> => {
      const doc = await db.collection('students').findOne({ _id: id });
      const { Student } = await import('@scholaracle/database');
      return new Student(doc as unknown as IStudentData, id);
    };
    expect(await s.resolveTimeZone(await load(mixed.studentId))).toBe('America/Los_Angeles');
    expect(await s.resolveTimeZone(await load(none.studentId))).toBe('America/New_York');
    expect(await s.resolveTimeZone(await load(junk.studentId))).toBe('America/New_York');
  });

  it('catch-up after downtime: a Tuesday tick sends the missed Sunday review once, not per tick', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    const tuesday = new Date('2026-11-10T15:00:00.000Z');
    await seedWeek(home, tuesday);

    const first = await sender(tuesday).runTick();
    expect(first).toMatchObject({ sent: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect((await sends())[0]).toMatchObject({ weekKey: '2026-W45', localDate: '2026-11-08' });

    for (let i = 1; i <= 4; i += 1) {
      const r = await sender(new Date(tuesday.getTime() + i * 15 * MINUTE_MS)).runTick();
      expect(r).toMatchObject({ sent: 0, skipped: 1 });
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

  it('adults get a copy only when their toggle is on, by their own channels, push included', async () => {
    const pushAdult = await seedAdultUser(true);
    const noDeviceAdult = await seedAdultUser(false);
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
          userId: pushAdult.toString(),
          email: 'pushy@example.com',
          role: 'parent',
          status: 'accepted',
          invitedAt: new Date(),
          alertChannels: ['push'],
          weeklyReviewCopy: true,
        },
        {
          userId: noDeviceAdult.toString(),
          email: 'no-phone-yet@example.com',
          role: 'parent',
          status: 'accepted',
          invitedAt: new Date(),
          alertChannels: ['push'],
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
      [NotificationChannel.PUSH, pushAdult.toString()],
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
    expect(queue.jobs[0]!.payload.agentType).toBe(AgentType.STUDENT);
    expect(queue.jobs).toHaveLength(5);
  });

  it('nobody to tell: enqueues nothing and keeps no row, so a toggle later that day still works', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago', withDevice: false });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result).toMatchObject({ considered: 1, sent: 0, noRecipients: 1 });
    expect(queue.jobs).toHaveLength(0);
    expect(await sends()).toHaveLength(0);

    await db.collection('students').updateOne(
      { _id: home.studentId },
      {
        $set: {
          ownerAlertPrefs: {
            receiveAlerts: true,
            alertChannels: ['email'],
            weeklyReviewCopy: true,
          },
        },
      }
    );
    const later = await sender(
      new Date(SUNDAY_1805_CHICAGO.getTime() + 2 * 60 * MINUTE_MS)
    ).runTick();
    expect(later).toMatchObject({ sent: 1 });
    expect(queue.jobs.map((j) => [j.channel, j.payload.userId])).toEqual([
      [NotificationChannel.EMAIL, 'owner@example.com'],
    ]);
    expect((await sends())[0]).toMatchObject({ status: 'sent', weekKey: '2026-W45' });
  });

  it('students with no login, no alertEmail and no adult copy are not even considered', async () => {
    await seedHousehold({ withLogin: false });
    const result = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(result.considered).toBe(0);
  });

  it('an enqueue failure leaves a partial row; the next tick enqueues only the missing delivery', async () => {
    const home = await seedHousehold({
      ownerTimeZone: 'America/Chicago',
      alertEmail: 'gideon@school.example',
    });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    queue.failOnCall = 2; // push goes out, the email add blows up

    const failed = await sender(SUNDAY_1805_CHICAGO).runTick();
    expect(failed).toMatchObject({ failed: 1, sent: 0 });
    expect(queue.jobs.map((j) => j.channel)).toEqual([NotificationChannel.PUSH]);
    const partial = (await sends())[0]!;
    expect(partial).toMatchObject({ status: 'partial', attempts: 1, lastError: 'queue down' });
    const recs = partial['deliveries'] as { channel: string; enqueuedAt?: Date }[];
    expect(recs.map((d) => [d.channel, d.enqueuedAt instanceof Date])).toEqual([
      [NotificationChannel.PUSH, true],
      [NotificationChannel.EMAIL, false],
    ]);

    const retry = await sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 15 * MINUTE_MS)).runTick();
    expect(retry).toMatchObject({ sent: 1 });
    // No duplicate push: exactly one job per (channel, recipient).
    expect(queue.jobs.map((j) => j.channel)).toEqual([
      NotificationChannel.PUSH,
      NotificationChannel.EMAIL,
    ]);
    const done = (await sends())[0]!;
    expect(done).toMatchObject({ status: 'sent', attempts: 2 });
    expect(done['lastError']).toBeUndefined();
    expect(
      (done['deliveries'] as { enqueuedAt?: Date }[]).every((d) => d.enqueuedAt instanceof Date)
    ).toBe(true);
  });

  it('a reservation left in `sending` by a crash is taken over after 15 minutes, not before', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO);
    const fresh = {
      ...sentRow(home, '2026-W45', 'sending'),
      reservedAt: new Date(SUNDAY_1805_CHICAGO.getTime() - MINUTE_MS),
    };
    await db.collection(WEEKLY_REVIEW_SENDS_COLLECTION).insertOne(fresh);

    // Another worker holds it: hands off.
    expect(await sender(SUNDAY_1805_CHICAGO).runTick()).toMatchObject({ skipped: 1, sent: 0 });
    expect(queue.jobs).toHaveLength(0);

    // The same row 20 minutes later is a corpse: take it over and finish the week.
    const later = new Date(SUNDAY_1805_CHICAGO.getTime() + 20 * MINUTE_MS);
    expect(WEEKLY_REVIEW_STALE_RESERVATION_MS).toBe(15 * MINUTE_MS);
    expect(await sender(later).runTick()).toMatchObject({ sent: 1 });
    expect(queue.jobs).toHaveLength(1);
    expect((await sends())[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('fails closed on a grade leak and gives up after three attempts for the week', async () => {
    const home = await seedHousehold({ ownerTimeZone: 'America/Chicago' });
    await seedWeek(home, SUNDAY_1805_CHICAGO, { missing: 'Quiz retake (scored 95%)' });
    expect(WEEKLY_REVIEW_MAX_ATTEMPTS).toBe(3);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const now = new Date(SUNDAY_1805_CHICAGO.getTime() + attempt * 15 * MINUTE_MS);
      expect(await sender(now).runTick()).toMatchObject({ failed: 1, sent: 0 });
      expect((await sends())[0]).toMatchObject({ status: 'failed', attempts: attempt });
    }
    expect(queue.jobs).toHaveLength(0);

    // Attempt four never happens: the row is final and nothing is even looked up.
    const quiet = sender(new Date(SUNDAY_1805_CHICAGO.getTime() + 60 * MINUTE_MS));
    const zoneLookups = jest.spyOn(quiet, 'resolveTimeZone');
    expect(await quiet.runTick()).toMatchObject({ skipped: 1, failed: 0 });
    expect(zoneLookups).not.toHaveBeenCalled();
    expect((await sends())[0]).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('isRowFinalForTick: sent and exhausted rows are final; partial and stale never are', () => {
    const now = new Date('2026-11-09T01:00:00.000Z');
    const base = { studentId: 's', weekKey: '2026-W45', deliveries: [] };
    expect(isRowFinalForTick({ ...base, status: 'sent', attempts: 1 }, now)).toBe(true);
    expect(isRowFinalForTick({ ...base, status: 'failed', attempts: 3 }, now)).toBe(true);
    expect(isRowFinalForTick({ ...base, status: 'failed', attempts: 2 }, now)).toBe(false);
    expect(isRowFinalForTick({ ...base, status: 'partial', attempts: 1 }, now)).toBe(false);
    expect(
      isRowFinalForTick(
        {
          ...base,
          status: 'sending',
          attempts: 1,
          reservedAt: new Date(now.getTime() - MINUTE_MS),
        },
        now
      )
    ).toBe(true);
    expect(
      isRowFinalForTick(
        {
          ...base,
          status: 'sending',
          attempts: 1,
          reservedAt: new Date(now.getTime() - 16 * MINUTE_MS),
        },
        now
      )
    ).toBe(false);
    expect(isRowFinalForTick({ ...base, status: 'sending', attempts: 1 }, now)).toBe(false);
  });
});
