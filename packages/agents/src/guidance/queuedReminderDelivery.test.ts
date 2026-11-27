import {
  Notification,
  type DeliveryResult,
  type INotificationPayload,
  type NotificationChannel,
} from '@scholaracle/contracts';
import { DeliveryRouter, EmailDelivery, ExpoPushDelivery, type IEmailEnvelope } from '../delivery';
import { ReminderNotificationSink, type IReminderQueue } from './ReminderNotificationSink';

/**
 * The sender only queues. These tests take what it queued and hand it to the deliveries the
 * workers process uses, the way `NotificationService.deliverOne` does, to show that a queued
 * reminder is one the workers can send, and what the person then gets.
 */

interface IQueuedJob {
  readonly payload: INotificationPayload;
  readonly channel: NotificationChannel;
}

interface IPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, unknown>;
}

const WEB = 'https://scholarmancy.example';
const STUDENT_ID = '665f1c2ab7e4a91d3c8b4501';
const STUDENT_LOGIN_ID = '665f1c2ab7e4a91d3c8b4502';
const OWNER_ID = '665f1c2ab7e4a91d3c8b4503';
const ASSIGNMENT = 'bio 101/lab #2';

function workers(tokensByUser: Record<string, readonly string[]>): {
  deliver(job: IQueuedJob): Promise<DeliveryResult>;
  readonly emails: IEmailEnvelope[];
  readonly pushes: IPushMessage[];
} {
  const emails: IEmailEnvelope[] = [];
  const pushes: IPushMessage[] = [];
  const router = new DeliveryRouter([
    new EmailDelivery(
      { fromEmail: 'alerts@scholarmancy.example', fromName: 'Scholarmancy', dashboardBaseUrl: WEB },
      {
        send: async (envelope): Promise<{ messageId: string }> => {
          emails.push(envelope);
          return { messageId: `mail-${emails.length}` };
        },
      }
    ),
    new ExpoPushDelivery({
      tokenStore: {
        getTokens: async (userId): Promise<readonly string[]> => tokensByUser[userId] ?? [],
      },
      send: async (messages): Promise<{ ok: boolean }> => {
        pushes.push(...messages);
        return { ok: true };
      },
    }),
  ]);
  return {
    // What NotificationService.deliverOne does with a `deliver` job.
    deliver: (job) => router.route(Notification.fromPayload(job.payload), job.channel),
    emails,
    pushes,
  };
}

async function queued(
  recipient: { email?: string; pushUserId?: string },
  message: Parameters<ReminderNotificationSink['send']>[0]
): Promise<IQueuedJob[]> {
  const jobs: IQueuedJob[] = [];
  const queue: IReminderQueue = {
    add: async (_type, _name, data): Promise<string> => {
      jobs.push({
        payload: data['notificationPayload'] as INotificationPayload,
        channel: data['channel'] as NotificationChannel,
      });
      return `job-${jobs.length}`;
    },
  };
  const sink = new ReminderNotificationSink({
    queue,
    webOrigin: WEB,
    resolveRecipient: async () => recipient,
  });
  await sink.send(message);
  return jobs;
}

describe('a queued reminder, sent by the workers', () => {
  const toStudent = {
    audience: 'student' as const,
    studentId: STUDENT_ID,
    body: 'Lab report — your parent asked you to pick this up. Open the worksheet.',
    deepLink: `/studio/assignments/${encodeURIComponent(ASSIGNMENT)}`,
    assignmentExternalId: ASSIGNMENT,
  };

  it("reaches every phone on the student's own login, with what the app needs to open it", async () => {
    const jobs = await queued(
      { email: 'emma@family.example', pushUserId: STUDENT_LOGIN_ID },
      toStudent
    );
    const sent = workers({
      [STUDENT_LOGIN_ID]: ['ExponentPushToken[phone]', 'ExponentPushToken[tablet]'],
      [OWNER_ID]: ['ExponentPushToken[parent]'],
    });

    const results = await Promise.all(jobs.map((job) => sent.deliver(job)));

    expect(results.map((r) => r.success)).toEqual([true, true]);
    expect(sent.pushes.map((p) => p.to)).toEqual([
      'ExponentPushToken[phone]',
      'ExponentPushToken[tablet]',
    ]);
    for (const push of sent.pushes) {
      expect(push.title).toBe('A next step');
      expect(push.body).toBe(toStudent.body);
      expect(push.data).toMatchObject({
        type: 'assignment_reminder',
        studentId: STUDENT_ID,
        assignmentId: ASSIGNMENT,
      });
    }
  });

  it("emails the student's login a link that opens the worksheet, and no parent page", async () => {
    const jobs = await queued({ email: 'emma@family.example' }, toStudent);
    const sent = workers({});

    const results = await Promise.all(jobs.map((job) => sent.deliver(job)));

    expect(results.map((r) => r.success)).toEqual([true]);
    expect(sent.pushes).toHaveLength(0);
    expect(sent.emails).toHaveLength(1);
    const [email] = sent.emails;
    expect(email?.to).toBe('emma@family.example');
    expect(email?.subject).toBe('A next step');
    const link = `${WEB}/studio/assignments/bio%20101%2Flab%20%232`;
    expect(email?.text).toContain(toStudent.body);
    expect(email?.text).toContain(link);
    expect(email?.html).toContain(link);
    expect(email?.html).not.toContain('/dashboard/');
    expect(email?.html).not.toContain('View in Dashboard');
  });

  it("emails the parent a link to the student's board, and pushes to the parent's own phone", async () => {
    const board = `/dashboard/students/${STUDENT_ID}?board=needs_attention#action-board`;
    const jobs = await queued(
      { email: 'parent@family.example', pushUserId: OWNER_ID },
      {
        audience: 'parent',
        studentId: STUDENT_ID,
        body: 'Lab report is still missing.',
        deepLink: board,
        assignmentExternalId: ASSIGNMENT,
      }
    );
    const sent = workers({
      [STUDENT_LOGIN_ID]: ['ExponentPushToken[phone]'],
      [OWNER_ID]: ['ExponentPushToken[parent]'],
    });

    const results = await Promise.all(jobs.map((job) => sent.deliver(job)));

    expect(results.map((r) => r.success)).toEqual([true, true]);
    expect(sent.pushes.map((p) => p.to)).toEqual(['ExponentPushToken[parent]']);
    expect(sent.pushes[0]?.data).toMatchObject({
      type: 'assignment_reminder',
      studentId: STUDENT_ID,
      assignmentId: ASSIGNMENT,
    });
    expect(sent.emails.map((e) => e.to)).toEqual(['parent@family.example']);
    expect(sent.emails[0]?.text).toContain(`${WEB}${board}`);
    // The parent's copy keeps the button to the student's page.
    expect(sent.emails[0]?.html).toContain(`${WEB}/dashboard/students/${STUDENT_ID}/workflow`);
  });
});
