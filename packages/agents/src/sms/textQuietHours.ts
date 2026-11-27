import { ObjectId, type Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import { quietHoursEnd } from '@scholaracle/studio-core';

/** What is read from an account to decide when its person may be texted. */
export interface ITextQuietHoursAccount {
  readonly timezone?: string;
  readonly preferences?: {
    readonly notifications?: {
      readonly quietHours?: {
        readonly enabled?: boolean;
        readonly start?: string;
        readonly end?: string;
        readonly criticalOverride?: boolean;
      };
    };
  };
}

/** What Settings shows for an account that never saved quiet hours. */
const DEFAULT_START = '22:00';
const DEFAULT_END = '07:00';
/** The account model's time zone for an account that has none. */
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * The time before which this person is not to be texted, or null when a text can go now.
 *
 * Their quiet hours hold every text but one about a critical alert; that one is held too
 * when they turned the exception off. An account that never saved quiet hours, or that
 * cannot be read, has the ones Settings shows: on, 22:00 to 07:00, critical alerts through.
 */
export function textNotBefore(
  account: ITextQuietHoursAccount | null,
  severity: string,
  now: Date
): Date | null {
  const saved = account?.preferences?.notifications?.quietHours;
  if (saved?.enabled === false) return null;
  if (severity === 'critical' && saved?.criticalOverride !== false) return null;
  return quietHoursEnd(now, account?.timezone ?? DEFAULT_TIMEZONE, {
    start: saved?.start ?? DEFAULT_START,
    end: saved?.end ?? DEFAULT_END,
  });
}

/**
 * `textNotBefore` for an account id, read from the database when it is asked. What the
 * notification service calls before it queues a text that goes at once.
 */
export function createTextNotBeforeLookup(
  database: Db,
  clock: () => Date = (): Date => new Date()
): (userId: string, severity: string) => Promise<Date | null> {
  const users = new UserRepository(database);
  return async (userId, severity): Promise<Date | null> => {
    const user = ObjectId.isValid(userId) ? await users.findById(userId) : null;
    return textNotBefore(user, severity, clock());
  };
}
