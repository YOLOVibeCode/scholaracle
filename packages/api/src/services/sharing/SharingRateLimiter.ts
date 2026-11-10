import type { Collection, Db } from 'mongodb';
import { RateLimitError } from '@scholaracle/contracts';

/** Invitations one account may send per UTC day (sharing-spec §4.7). */
export const INVITES_PER_USER_PER_DAY = 20;
/** Re-sends per invite group per UTC day (sharing-spec §4.7). */
export const RESENDS_PER_GROUP_PER_DAY = 5;

interface ICounterDoc {
  key: string;
  count: number;
  /** TTL anchor: Mongo drops the row an hour after the day ends (see database/src/indexes.ts). */
  expiresAt: Date;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function endOfUtcDay(now: Date): Date {
  const end = new Date(now);
  end.setUTCHours(24, 0, 0, 0);
  return end;
}

/**
 * Small per-day counters in Mongo (`sharing_rate_limits`), so limits hold across API instances
 * and restarts. Each `take` increments first and refuses when the new count exceeds the limit.
 *
 * The unique key + TTL indexes are created by `createIndexes` at boot like every other
 * collection; `_ensureIndexes` is the fallback for processes that did not run it (tests,
 * scripts) and retries on the next call until it has succeeded once.
 */
export class SharingRateLimiter {
  private readonly _collection: Collection<ICounterDoc>;
  private _indexesReady = false;

  constructor(
    database: Db,
    private readonly _now: () => Date = (): Date => new Date()
  ) {
    this._collection = database.collection<ICounterDoc>('sharing_rate_limits');
  }

  /** One invitation sent by `userId` today; throws RateLimitError past the daily cap. */
  public async takeInvite(userId: string): Promise<void> {
    await this._take(
      `invite:${userId}`,
      INVITES_PER_USER_PER_DAY,
      'Too many invitations today. Please try again tomorrow.'
    );
  }

  /** One re-send of invite group `inviteGroupId` today; throws RateLimitError past the cap. */
  public async takeResend(inviteGroupId: string): Promise<void> {
    await this._take(
      `resend:${inviteGroupId}`,
      RESENDS_PER_GROUP_PER_DAY,
      'This invitation was re-sent too many times today. Please try again tomorrow.'
    );
  }

  private async _take(scope: string, limit: number, message: string): Promise<void> {
    await this._ensureIndexes();
    const now = this._now();
    const key = `${scope}:${utcDay(now)}`;
    const doc = await this._collection.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { key, expiresAt: endOfUtcDay(now) } },
      { upsert: true, returnDocument: 'after' }
    );
    if ((doc?.count ?? 0) > limit) {
      throw new RateLimitError(message);
    }
  }

  private async _ensureIndexes(): Promise<void> {
    if (this._indexesReady) return;
    try {
      await this._collection.createIndex({ key: 1 }, { unique: true });
      await this._collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });
      // Only a successful round marks the indexes ready; a failure is retried on the next call.
      this._indexesReady = true;
    } catch (err) {
      console.error('[sharing] rate-limit index creation failed; will retry', err);
    }
  }
}
