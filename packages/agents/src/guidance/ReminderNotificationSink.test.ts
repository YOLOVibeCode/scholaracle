import { AgentType, NotificationChannel, type INotificationPayload } from '@scholaracle/contracts';
import {
  REMINDER_TRIGGER,
  ReminderNotificationSink,
  type IReminderQueue,
  type IReminderRecipient,
} from './ReminderNotificationSink';

interface IQueuedJob {
  readonly type: string;
  readonly name: string;
  readonly payload: INotificationPayload;
  readonly channel: NotificationChannel;
  readonly maxAttempts?: number;
}

class FakeQueue implements IReminderQueue {
  public readonly jobs: IQueuedJob[] = [];

  public async add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string> {
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

const WEB = 'https://scholarmancy.example';
const STUDENT = 'emma-id';
const CELL = 'demo-emma-ap-bio-a5';

const STUDENT_REMINDER = {
  audience: 'student' as const,
  studentId: STUDENT,
  body: 'Still open — tap to pick it up.',
  deepLink: `/studio/assignments/${CELL}`,
  assignmentExternalId: CELL,
};

const PARENT_REMINDER = {
  audience: 'parent' as const,
  studentId: STUDENT,
  body: 'Cell Division is still missing.',
  deepLink: `/dashboard/students/${STUDENT}?board=needs_attention#action-board`,
  assignmentExternalId: CELL,
};

function sinkFor(
  recipient: IReminderRecipient,
  webOrigin: string = WEB
): { sink: ReminderNotificationSink; queue: FakeQueue; asked: Array<[string, string]> } {
  const queue = new FakeQueue();
  const asked: Array<[string, string]> = [];
  const sink = new ReminderNotificationSink({
    queue,
    webOrigin,
    resolveRecipient: async (audience, studentId) => {
      asked.push([audience, studentId]);
      return recipient;
    },
  });
  return { sink, queue, asked };
}

function only(jobs: readonly IQueuedJob[], channel: NotificationChannel): IQueuedJob {
  const found = jobs.filter((j) => j.channel === channel);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('ReminderNotificationSink', () => {
  it("sends a student's reminder to their phone and to their login email", async () => {
    const { sink, queue, asked } = sinkFor({
      email: 'emma@logins.example',
      pushUserId: 'emma-user-id',
    });

    const result = await sink.send(STUDENT_REMINDER);

    expect(result).toEqual({ deliveries: 2 });
    expect(asked).toEqual([['student', STUDENT]]);
    expect(queue.jobs).toHaveLength(2);
    for (const job of queue.jobs) {
      // The worker's deliver loop sends these, and tries again when a send fails.
      expect({ type: job.type, name: job.name, maxAttempts: job.maxAttempts }).toEqual({
        type: 'deliver',
        name: 'deliver-one',
        maxAttempts: 5,
      });
    }

    const push = only(queue.jobs, NotificationChannel.PUSH);
    expect(push.payload).toMatchObject({
      agentType: AgentType.STUDENT,
      userId: 'emma-user-id',
      studentId: STUDENT,
      subject: 'A next step',
      body: 'Still open — tap to pick it up.',
      triggerType: REMINDER_TRIGGER,
      triggerData: { studentId: STUDENT, assignmentExternalId: CELL },
      channels: [NotificationChannel.PUSH],
    });

    const email = only(queue.jobs, NotificationChannel.EMAIL);
    expect(email.payload).toMatchObject({
      agentType: AgentType.STUDENT,
      userId: 'emma@logins.example',
      subject: 'A next step',
      triggerType: REMINDER_TRIGGER,
      channels: [NotificationChannel.EMAIL],
    });
    expect(email.payload.id).not.toBe(push.payload.id);
  });

  it('puts a link the student can open in the email, and no link text in the push', async () => {
    const { sink, queue } = sinkFor({ email: 'emma@logins.example', pushUserId: 'emma-user-id' });

    await sink.send(STUDENT_REMINDER);

    const email = only(queue.jobs, NotificationChannel.EMAIL);
    expect(email.payload.body).toBe(
      `Still open — tap to pick it up.\n${WEB}/studio/assignments/${CELL}`
    );
    // A tap on the push opens the app; a web address in its text would only be noise.
    expect(only(queue.jobs, NotificationChannel.PUSH).payload.body).not.toContain('/studio/');
  });

  it("leaves the parent dashboard button out of a student's email", async () => {
    const { sink, queue } = sinkFor({ email: 'emma@logins.example' });

    await sink.send(STUDENT_REMINDER);

    // EmailDelivery adds a "View in Dashboard" button for any studentId. That page is the
    // parent's; a student login cannot open it.
    expect(only(queue.jobs, NotificationChannel.EMAIL).payload.studentId).toBe('');
  });

  it('sends only the email when the student has no phone registered', async () => {
    const { sink, queue } = sinkFor({ email: 'emma@logins.example' });

    const result = await sink.send(STUDENT_REMINDER);

    expect(result).toEqual({ deliveries: 1 });
    expect(queue.jobs.map((j) => j.channel)).toEqual([NotificationChannel.EMAIL]);
  });

  it('sends only the push when the student has a phone and no email', async () => {
    const { sink, queue } = sinkFor({ pushUserId: 'emma-user-id' });

    await sink.send(STUDENT_REMINDER);

    expect(queue.jobs.map((j) => j.channel)).toEqual([NotificationChannel.PUSH]);
  });

  it('queues nothing, and says so, when there is nobody to reach', async () => {
    const { sink, queue } = sinkFor({});

    // The caller reads this: a nudge that went to nobody must not be shown as "Nudged".
    expect(await sink.send(STUDENT_REMINDER)).toEqual({ deliveries: 0 });
    expect(await sink.send(PARENT_REMINDER)).toEqual({ deliveries: 0 });

    expect(queue.jobs).toEqual([]);
  });

  it('treats a blank address and a blank user id as nobody', async () => {
    const { sink, queue } = sinkFor({ email: '   ', pushUserId: '' });

    expect(await sink.send(STUDENT_REMINDER)).toEqual({ deliveries: 0 });
    expect(queue.jobs).toEqual([]);
  });

  it("links a parent's email to the student's board and keeps the dashboard button", async () => {
    const { sink, queue, asked } = sinkFor({ email: 'owner@example.com' });

    await sink.send(PARENT_REMINDER);

    expect(asked).toEqual([['parent', STUDENT]]);
    const email = only(queue.jobs, NotificationChannel.EMAIL);
    expect(email.payload).toMatchObject({
      agentType: AgentType.PARENT,
      userId: 'owner@example.com',
      studentId: STUDENT,
      subject: 'Scholarmancy',
      body: `Cell Division is still missing.\n${WEB}/dashboard/students/${STUDENT}?board=needs_attention#action-board`,
    });
    expect(queue.jobs).toHaveLength(1);
  });

  it("sends a parent's reminder to their own phone when they asked for push", async () => {
    const { sink, queue } = sinkFor({ email: 'owner@example.com', pushUserId: 'owner-user-id' });

    await sink.send(PARENT_REMINDER);

    expect(only(queue.jobs, NotificationChannel.PUSH).payload).toMatchObject({
      agentType: AgentType.PARENT,
      userId: 'owner-user-id',
      studentId: STUDENT,
      subject: 'Scholarmancy',
      body: 'Cell Division is still missing.',
      triggerData: { studentId: STUDENT, assignmentExternalId: CELL },
    });
    expect(queue.jobs).toHaveLength(2);
  });

  it('builds one link from a site address that ends in a slash', async () => {
    const { sink, queue } = sinkFor({ email: 'emma@logins.example' }, `${WEB}/`);

    await sink.send(STUDENT_REMINDER);

    expect(only(queue.jobs, NotificationChannel.EMAIL).payload.body).toContain(
      `\n${WEB}/studio/assignments/${CELL}`
    );
  });

  it('sends a reminder that names no assignment, without an assignment id', async () => {
    const { sink, queue } = sinkFor({ pushUserId: 'emma-user-id' });

    await sink.send({
      audience: 'student',
      studentId: STUDENT,
      body: 'Still open — tap to pick it up.',
      deepLink: '/studio',
    });

    expect(only(queue.jobs, NotificationChannel.PUSH).payload.triggerData).toEqual({
      studentId: STUDENT,
    });
  });
});
