/**
 * Alerts by text, from the alert to the request the relay would get, with nothing leaving
 * the machine.
 *
 * Everything here is the real thing: the notification service as the worker builds it,
 * the recipient resolver, the queue, the consent records, the gate and the daily summary,
 * on a real (in-memory) database. Only `fetch` is replaced, so the request that would go
 * to the relay is caught and read here, and no text is sent.
 */

jest.mock('firebase-admin', () => ({
  __esModule: true,
  messaging: jest.fn(() => ({ send: jest.fn() })),
  initializeApp: jest.fn(),
}));

jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: { setApiKey: jest.fn(), send: jest.fn() },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import {
  Alert,
  AlertType,
  NotificationChannel,
  SCHOLARMANCY_SMS_PURPOSE,
  SMS_RELAY_SEND_URL,
  type INotificationPayload,
} from '@scholaracle/contracts';
import {
  createSmsStack,
  MongoQueue,
  resolveAllAlertRecipients,
  type NotificationService,
} from '@scholaracle/agents';
import { SmsConsentRepository } from '@scholaracle/database';
import { initializeNotificationService } from './worker';
import { SmsDigestFlusher } from './digest/sms-digest-flush';
import { logger } from './logger';

const OWNER_PHONE = '+15125550100';
/** The history keeps a number only in this form. */
const OWNER_PHONE_MASKED = '+1***0100';
const COPARENT_PHONE = '+15125550111';
const WEB = 'https://scholarmancy.com';
const TAIL = `Details: ${WEB}/alerts Reply STOP to opt out.`;
/** The hour of the daily text summary. */
const NOON_CENTRAL = new Date('2026-11-28T18:00:00Z');
const HOUR = 60 * 60 * 1000;

interface IRelayRequest {
  readonly url: string;
  readonly appEnv: string | undefined;
  readonly authorization: string | undefined;
  readonly to: string;
  readonly body: string;
}

interface IHouseholdOptions {
  /** The owner's daily digest. On is what a new account has. */
  readonly dailyDigest?: boolean;
  /** The owner's channels for this student. */
  readonly channels?: readonly string[];
  /** Consent for the owner's number: on record (default), never given, or withdrawn (STOP). */
  readonly consent?: 'given' | 'none' | 'withdrawn';
  readonly quietHours?: { readonly start: string; readonly end: string };
  /** A second adult who follows the student, with their own number and channels. */
  readonly coparent?: { readonly channels: readonly string[] };
}

interface IHousehold {
  readonly ownerId: string;
  readonly studentId: string;
  readonly coparentId: string;
}

interface ITextJob {
  readonly payload: INotificationPayload;
  readonly scheduledFor: Date;
  readonly maxAttempts: number;
}

/** `HH:mm` on the UTC clock, `hours` from now. */
function utcClock(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString().slice(11, 16);
}

describe('alerts by text', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let relayRequests: IRelayRequest[];
  /** What the faked relay answers with. */
  let relayAnswer: Record<string, unknown>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = new MongoClient(mongo.getUri());
    await client.connect();
    db = client.db('alerts_by_text_test');
    // The link in a text is built from these; the tests expect the public site.
    for (const key of ['BASE_URL', 'WEB_URL', 'NEXT_PUBLIC_APP_URL']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
    await client.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    for (const name of [
      'users',
      'students',
      'jobs',
      'sms_consents',
      'sms_digest_pending',
      'email_digest_pending',
      'communication_logs',
    ]) {
      await db.collection(name).deleteMany({});
    }
    relayRequests = [];
    relayAnswer = { success: true, message: { twilio_sid: 'SM-from-the-relay', status: 'queued' } };
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    // The relay, faked. Any other request fails the test instead of leaving the machine.
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input) !== SMS_RELAY_SEND_URL) {
        return Promise.reject(new Error('a request left for somewhere other than the relay'));
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const sent = JSON.parse(String(init?.body)) as { to: string; body: string };
      relayRequests.push({
        url: String(input),
        appEnv: headers['X-App-Env'],
        authorization: headers['Authorization'],
        to: sent.to,
        body: sent.body,
      });
      return Promise.resolve(new Response(JSON.stringify(relayAnswer), { status: 201 }));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function account(
    id: ObjectId,
    email: string,
    phone: string,
    options: Pick<IHouseholdOptions, 'dailyDigest' | 'quietHours'>
  ): Record<string, unknown> {
    return {
      _id: id,
      email,
      passwordHash: 'not-a-hash',
      name: 'A Parent',
      role: 'parent',
      phone,
      smsConsent: true,
      // Quiet hours are given on the UTC clock so that a test can place them around now.
      timezone: 'UTC',
      preferences: {
        notifications: {
          push: true,
          email: true,
          sms: true,
          quietHours: {
            enabled: options.quietHours !== undefined,
            start: options.quietHours?.start ?? '22:00',
            end: options.quietHours?.end ?? '07:00',
            criticalOverride: true,
          },
          digestSchedule: { daily: { enabled: options.dailyDigest ?? true, time: '07:00' } },
          frequency: 'balanced',
        },
      },
      devices: [],
    };
  }

  async function household(options: IHouseholdOptions = {}): Promise<IHousehold> {
    const ownerId = new ObjectId();
    const coparentId = new ObjectId();
    const studentId = new ObjectId();
    const now = new Date();
    const coparentEmail = `coparent-${coparentId.toString()}@example.com`;
    await db
      .collection('users')
      .insertOne(account(ownerId, `owner-${ownerId.toString()}@example.com`, OWNER_PHONE, options));
    if (options.coparent !== undefined) {
      await db
        .collection('users')
        .insertOne(account(coparentId, coparentEmail, COPARENT_PHONE, options));
    }
    await db.collection('students').insertOne({
      _id: studentId,
      userId: ownerId.toString(),
      name: 'Emma Lopez',
      dataSources: [],
      ownerAlertPrefs: { receiveAlerts: true, alertChannels: options.channels ?? ['email', 'sms'] },
      sharedWith:
        options.coparent !== undefined
          ? [
              {
                userId: coparentId.toString(),
                email: coparentEmail,
                role: 'parent',
                status: 'accepted',
                invitedAt: now,
                acceptedAt: now,
                phone: COPARENT_PHONE,
                receiveAlerts: true,
                alertChannels: options.coparent.channels,
              },
            ]
          : [],
      createdAt: now,
      updatedAt: now,
    });
    const consents = new SmsConsentRepository(db);
    const optIn = (phoneE164: string): Promise<unknown> =>
      consents.recordOptIn({
        phoneE164,
        purpose: SCHOLARMANCY_SMS_PURPOSE,
        consentTextVersion: 'test',
        source: '/register',
      });
    if (options.consent !== 'none') await optIn(OWNER_PHONE);
    if (options.consent === 'withdrawn') {
      await consents.recordOptOut(OWNER_PHONE, SCHOLARMANCY_SMS_PURPOSE);
    }
    if (options.coparent !== undefined) await optIn(COPARENT_PHONE);
    return {
      ownerId: ownerId.toString(),
      studentId: studentId.toString(),
      coparentId: coparentId.toString(),
    };
  }

  function gradeDrop(studentId: string, severity = 'warning'): Alert {
    return new Alert({
      studentId,
      type: AlertType.GRADE_DROP,
      severity,
      relatedData: {
        studentName: 'Emma Lopez',
        course: 'Math',
        previousGrade: 88,
        currentGrade: 72,
      },
    });
  }

  function needsHelp(studentId: string): Alert {
    return new Alert({
      studentId,
      type: AlertType.STUDENT_NEEDS_HELP,
      severity: 'info',
      relatedData: { studentName: 'Emma Lopez', title: 'Ch. 5 problems', course: 'Math' },
    });
  }

  /**
   * The service as the worker builds it, in Railway's production environment or (`elsewhere`)
   * in one that does not say where it is.
   */
  function serviceWithKey(where: 'production' | 'elsewhere' = 'production'): {
    readonly service: NotificationService;
    readonly summaries: SmsDigestFlusher;
  } {
    const stack = createSmsStack(db, 'test-key', {
      ...(where === 'production' ? { RAILWAY_ENVIRONMENT_NAME: 'production' } : {}),
    });
    if (stack === null) throw new Error('no text stack was built');
    return {
      service: initializeNotificationService({}, db, undefined, stack),
      summaries: new SmsDigestFlusher(db, stack.guardedSender, { webOrigin: WEB }),
    };
  }

  /** What the notify job does with an alert: resolve the people, then queue or keep. */
  async function raise(service: NotificationService, alert: Alert): Promise<void> {
    const people = await resolveAllAlertRecipients(alert.studentId, db);
    await service.processAlertEnqueueDeliver(alert, new MongoQueue(db), people);
  }

  async function textJobs(): Promise<ITextJob[]> {
    const jobs = await db
      .collection('jobs')
      .find({ type: 'deliver', 'data.channel': NotificationChannel.SMS })
      .toArray();
    return jobs.map((job) => ({
      payload: (job['data'] as { notificationPayload: INotificationPayload }).notificationPayload,
      scheduledFor: job['scheduledFor'] as Date,
      maxAttempts: job['maxAttempts'] as number,
    }));
  }

  const waiting = (): Promise<number> => db.collection('sms_digest_pending').countDocuments({});

  async function history(): Promise<Array<Record<string, unknown>>> {
    const rows = await db.collection('communication_logs').find({}).toArray();
    return rows.map((row) => ({
      userId: row['userId'],
      channel: row['channel'],
      status: row['status'],
      to: row['recipientPhone'],
      template: row['templateName'],
      providerId: row['providerId'],
    }));
  }

  describe('with the text key set', () => {
    it('reaches a parent who chose text as one summary text a day', async () => {
      const home = await household();
      const { service, summaries } = serviceWithKey();

      await raise(service, gradeDrop(home.studentId));
      await raise(service, gradeDrop(home.studentId, 'critical'));

      // Nothing goes at once: both alerts wait for the summary.
      expect(await textJobs()).toEqual([]);
      expect(await waiting()).toBe(2);
      expect(relayRequests).toEqual([]);

      const tally = await summaries.flush(NOON_CENTRAL);

      expect(tally).toEqual({ sent: 1, dropped: 0, waiting: 0 });
      expect(relayRequests).toEqual([
        {
          url: 'https://api.twilio.noctusoft.com/sms/send',
          appEnv: 'production',
          authorization: 'Bearer test-key',
          to: OWNER_PHONE,
          body: `Scholarmancy: Your daily summary: 2 new alerts. ${TAIL}`,
        },
      ]);
      expect(await waiting()).toBe(0);
      expect(await history()).toEqual([
        {
          userId: home.ownerId,
          channel: 'sms',
          status: 'sent',
          to: OWNER_PHONE_MASKED,
          template: 'sms_digest',
          providerId: 'SM-from-the-relay',
        },
      ]);
    });

    it('reaches a parent whose daily digest is off with a text for each alert, at once', async () => {
      const home = await household({ dailyDigest: false });
      const { service } = serviceWithKey();

      await raise(service, gradeDrop(home.studentId));

      const jobs = await textJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.payload.userId).toBe(OWNER_PHONE);
      expect(jobs[0]?.payload.recipientUserId).toBe(home.ownerId);
      expect(jobs[0]?.maxAttempts).toBe(5);
      expect(jobs[0]?.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now());
      expect(await waiting()).toBe(0);

      // What the deliver job does with it.
      const result = await service.deliverOne(jobs[0]!.payload, NotificationChannel.SMS);

      expect(result).toMatchObject({ success: true, messageId: 'SM-from-the-relay' });
      expect(relayRequests).toEqual([
        {
          url: 'https://api.twilio.noctusoft.com/sms/send',
          appEnv: 'production',
          authorization: 'Bearer test-key',
          to: OWNER_PHONE,
          body: `Scholarmancy: Emma's Math grade dropped from 88% to 72%. ${TAIL}`,
        },
      ]);
      expect(await history()).toEqual([
        {
          userId: home.ownerId,
          channel: 'sms',
          status: 'sent',
          to: OWNER_PHONE_MASKED,
          template: 'sms_grade_drop',
          providerId: 'SM-from-the-relay',
        },
      ]);
    });

    it('texts a parent at once when the student asks for help, daily digest or not', async () => {
      const home = await household({ dailyDigest: true });
      const { service } = serviceWithKey();

      await raise(service, needsHelp(home.studentId));

      const jobs = await textJobs();
      expect(jobs).toHaveLength(1);
      expect(await waiting()).toBe(0);
      await service.deliverOne(jobs[0]!.payload, NotificationChannel.SMS);
      expect(relayRequests.map((request) => request.body)).toEqual([
        `Scholarmancy: Emma asked for help with Ch. 5 problems in Math. ${TAIL}`,
      ]);
    });

    it('holds a text that goes at once until the quiet hours of the parent end', async () => {
      // Quiet from an hour ago until two hours from now, on the clock of the account.
      const end = utcClock(2);
      const home = await household({ quietHours: { start: utcClock(-1), end } });
      const { service } = serviceWithKey();

      await raise(service, needsHelp(home.studentId));

      const jobs = await textJobs();
      expect(jobs).toHaveLength(1);
      const until = jobs[0]!.scheduledFor;
      expect(until.toISOString().slice(11, 16)).toBe(end);
      expect(until.getTime()).toBeGreaterThan(Date.now() + HOUR);
      expect(until.getTime()).toBeLessThanOrEqual(Date.now() + 2 * HOUR);
      // The queue hands out only jobs that are due: the email now, the text not before then.
      const queue = new MongoQueue(db);
      const dueNow: unknown[] = [];
      for (let job = await queue.getNextJob({ type: 'deliver' }); job !== null;) {
        dueNow.push(job.data['channel']);
        job = await queue.getNextJob({ type: 'deliver' });
      }
      expect(dueNow).toEqual([NotificationChannel.EMAIL]);
    });

    it('sends a text that goes at once now, outside the quiet hours of the parent', async () => {
      const home = await household({ quietHours: { start: utcClock(2), end: utcClock(3) } });
      const { service } = serviceWithKey();

      await raise(service, needsHelp(home.studentId));

      const jobs = await textJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it.each(['none', 'withdrawn'] as const)(
      'neither texts nor keeps anything for a parent whose consent is %s',
      async (consent) => {
        const digestOn = await household({ consent });
        const digestOff = await household({ consent, dailyDigest: false });
        const { service, summaries } = serviceWithKey();

        await raise(service, gradeDrop(digestOn.studentId));
        await raise(service, gradeDrop(digestOff.studentId));
        await raise(service, needsHelp(digestOff.studentId));

        expect(await textJobs()).toEqual([]);
        expect(await waiting()).toBe(0);
        expect(await summaries.flush(NOON_CENTRAL)).toEqual({ sent: 0, dropped: 0, waiting: 0 });
        expect(relayRequests).toEqual([]);
        expect(await history()).toEqual([]);
      }
    );

    it('does not text a parent who chose email only', async () => {
      const home = await household({ channels: ['email'], dailyDigest: false });
      const { service } = serviceWithKey();

      await raise(service, gradeDrop(home.studentId));

      expect(await textJobs()).toEqual([]);
      expect(await waiting()).toBe(0);
    });

    it('texts each adult who chose text on their own number, under their own account', async () => {
      const home = await household({
        dailyDigest: false,
        channels: ['email'],
        coparent: { channels: ['sms'] },
      });
      const { service } = serviceWithKey();

      await raise(service, gradeDrop(home.studentId));

      const jobs = await textJobs();
      expect(jobs.map((job) => [job.payload.userId, job.payload.recipientUserId])).toEqual([
        [COPARENT_PHONE, home.coparentId],
      ]);
      await service.deliverOne(jobs[0]!.payload, NotificationChannel.SMS);
      expect(relayRequests.map((request) => request.to)).toEqual([COPARENT_PHONE]);
      expect((await history()).map((row) => row['userId'])).toEqual([home.coparentId]);
    });

    it('tells the relay "dev" anywhere but production, and logs what the relay kept as a preview', async () => {
      relayAnswer = { success: true, captured: true, message: { status: 'captured' } };
      const home = await household({ dailyDigest: false });
      const { service } = serviceWithKey('elsewhere');

      await raise(service, gradeDrop(home.studentId));
      const jobs = await textJobs();
      await service.deliverOne(jobs[0]!.payload, NotificationChannel.SMS);

      expect(relayRequests.map((request) => request.appEnv)).toEqual(['dev']);
      expect((await history()).map((row) => row['status'])).toEqual(['preview']);
    });
  });

  describe('without the text key', () => {
    it('queues nothing and keeps nothing for a text', async () => {
      const digestOn = await household();
      const digestOff = await household({ dailyDigest: false });
      const service = initializeNotificationService({}, db, undefined, null);

      await raise(service, gradeDrop(digestOn.studentId));
      await raise(service, gradeDrop(digestOff.studentId));
      await raise(service, needsHelp(digestOff.studentId));

      expect(await textJobs()).toEqual([]);
      expect(await waiting()).toBe(0);
      expect(relayRequests).toEqual([]);
      // The alerts still go out the way they did: by email.
      const emails = await db
        .collection('jobs')
        .countDocuments({ type: 'deliver', 'data.channel': NotificationChannel.EMAIL });
      expect(emails).toBeGreaterThan(0);
    });
  });
});
