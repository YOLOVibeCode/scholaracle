import { randomUUID } from 'node:crypto';
import {
  AgentType,
  NotificationChannel,
  NotificationPriority,
  type INotificationPayload,
} from '@scholaracle/contracts';
import type {
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
} from '@scholaracle/interfaces';

/** `triggerType` of a ladder reminder or a parent's nudge; the phone gets it as `data.type`. */
export const REMINDER_TRIGGER = 'assignment_reminder';

/** Who one message goes to. Either part may be missing; both missing means nobody. */
export interface IReminderRecipient {
  /** Where the email goes. */
  readonly email?: string;
  /** The user whose registered phones get the push. Set only when there is a phone. */
  readonly pushUserId?: string;
}

export type ReminderRecipientResolver = (
  audience: 'student' | 'parent',
  studentId: string
) => Promise<IReminderRecipient>;

/** The one queue method the sink needs; `MongoQueue` satisfies it, tests pass a fake. */
export interface IReminderQueue {
  add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options?: { readonly maxAttempts?: number }
  ): Promise<string>;
}

export interface IReminderSinkDeps {
  readonly queue: IReminderQueue;
  readonly resolveRecipient: ReminderRecipientResolver;
  /** The site's address, e.g. https://scholarmancy.com. Links in emails start with it. */
  readonly webOrigin: string;
}

const DELIVER_ATTEMPTS = 5;

function absoluteUrl(webOrigin: string, path: string): string {
  return `${webOrigin.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Sends ladder reminders and a parent's nudge.
 *
 * Each message becomes `deliver` jobs for the workers process: a push to the person's
 * phones when one is registered, and an email with a link they can open. The API and the
 * workers share the queue, so the nudge route (API) and the ladder (workers) send the same
 * way. A student is told on their own phone and at their own login; nothing a student gets
 * points at a parent page.
 */
export class ReminderNotificationSink implements INotificationSink {
  public constructor(private readonly _deps: IReminderSinkDeps) {}

  public async send(input: INotificationSinkMessage): Promise<INotificationSinkResult> {
    const to = await this._deps.resolveRecipient(input.audience, input.studentId);
    let deliveries = 0;
    const forStudent = input.audience === 'student';
    const assignmentExternalId = input.assignmentExternalId ?? '';
    const base = {
      agentType: forStudent ? AgentType.STUDENT : AgentType.PARENT,
      subject: forStudent ? 'A next step' : 'Scholarmancy',
      priority: NotificationPriority.MEDIUM,
      triggerType: REMINDER_TRIGGER,
      triggerData: {
        studentId: input.studentId,
        ...(assignmentExternalId !== '' && { assignmentExternalId }),
      },
    };

    const pushUserId = to.pushUserId?.trim() ?? '';
    if (pushUserId !== '') {
      // A tap opens the app on the right screen (the phone reads studentId and the
      // assignment id from the push data), so the text carries no web address.
      await this._enqueue(NotificationChannel.PUSH, {
        ...base,
        id: randomUUID(),
        userId: pushUserId,
        studentId: input.studentId,
        body: input.body,
        channels: [NotificationChannel.PUSH],
      });
      deliveries += 1;
    }

    const email = to.email?.trim() ?? '';
    if (email !== '') {
      await this._enqueue(NotificationChannel.EMAIL, {
        ...base,
        id: randomUUID(),
        userId: email,
        // EmailDelivery turns a studentId into a "View in Dashboard" button. That page is
        // the parent's, so a student's email goes out without one.
        studentId: forStudent ? '' : input.studentId,
        body: `${input.body}\n${absoluteUrl(this._deps.webOrigin, input.deepLink)}`,
        channels: [NotificationChannel.EMAIL],
      });
      deliveries += 1;
    }

    // Zero tells the caller nobody could be reached, so it does not record a send.
    return { deliveries };
  }

  private async _enqueue(
    channel: NotificationChannel,
    notificationPayload: INotificationPayload
  ): Promise<void> {
    await this._deps.queue.add(
      'deliver',
      'deliver-one',
      { notificationPayload, channel },
      { maxAttempts: DELIVER_ATTEMPTS }
    );
  }
}
