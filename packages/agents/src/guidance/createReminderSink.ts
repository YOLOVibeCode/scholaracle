import type { Db } from 'mongodb';
import { ReminderNotificationSink, type IReminderQueue } from './ReminderNotificationSink';
import { createReminderRecipientResolver } from './reminderRecipients';

export interface IReminderSinkConfig {
  readonly database: Db;
  /** The queue the workers process drains (`MongoQueue`). */
  readonly queue: IReminderQueue;
  /** The site's address, e.g. https://scholarmancy.com. */
  readonly webOrigin: string;
}

/**
 * The one sender for ladder reminders and the parent's nudge. The workers process and the
 * API each build it here, so a nudge and a reminder reach the same people the same way.
 */
export function createReminderSink(config: IReminderSinkConfig): ReminderNotificationSink {
  return new ReminderNotificationSink({
    queue: config.queue,
    webOrigin: config.webOrigin,
    resolveRecipient: createReminderRecipientResolver(config.database),
  });
}
