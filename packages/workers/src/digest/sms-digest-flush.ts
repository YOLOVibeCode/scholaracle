/**
 * The daily text summary: one text per person for the alerts that waited since the last one.
 * The schedule calls `flush` every minute of the hour the summary goes out in.
 */

import type { Db } from 'mongodb';
import {
  CommunicationLogRepository,
  SmsDigestPendingRepository,
  type ISmsDigestPendingItem,
} from '@scholaracle/database';
import { buildSmsDigestBody, SmsNotSentError, type GuardedSmsSender } from '@scholaracle/agents';
import { logger } from '../logger';

/** After an attempt that did not go through, how long a person's summary waits before the next. */
export const SMS_DIGEST_RETRY_WAIT_MS = 15 * 60 * 1000;

/**
 * A person gets one summary a day. The schedule calls for an hour each day, so once a
 * person's summary is dealt with, nothing more is tried for them until the next day's hour.
 */
export const SMS_DIGEST_MIN_GAP_MS = 20 * 60 * 60 * 1000;

/** An alert that has waited this long is no longer news. It is dropped, not summarised. */
export const SMS_DIGEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ISmsDigestFlusherOptions {
  /** Web origin for the details link in the text. */
  readonly webOrigin: string;
}

export interface ISmsDigestFlushTally {
  /** People whose summary went out. */
  readonly sent: number;
  /** People whose waiting alerts were dropped: the number cannot be texted, or all were stale. */
  readonly dropped: number;
  /** People whose summary did not go out and waits for a later attempt. */
  readonly waiting: number;
}

type Outcome = keyof ISmsDigestFlushTally | 'skipped';

const JOB = 'sms-digest';

export class SmsDigestFlusher {
  private readonly _pending: SmsDigestPendingRepository;
  private readonly _commLogs: CommunicationLogRepository;
  /**
   * Per person: no attempt before this time. Kept in memory, so a restart forgets it: the
   * cost is one attempt too early, or a second summary for an alert that arrives in the
   * same hour as the restart.
   */
  private readonly _notBefore = new Map<string, number>();

  constructor(
    database: Db,
    private readonly _sender: GuardedSmsSender,
    private readonly _options: ISmsDigestFlusherOptions
  ) {
    this._pending = new SmsDigestPendingRepository(database);
    this._commLogs = new CommunicationLogRepository(database);
  }

  public async flush(now: Date = new Date()): Promise<ISmsDigestFlushTally> {
    const tally = { sent: 0, dropped: 0, waiting: 0 };
    for (const userId of await this._pending.getDistinctUserIds()) {
      const outcome = await this._flushOne(userId, now);
      if (outcome !== 'skipped') tally[outcome] += 1;
    }
    return tally;
  }

  private async _flushOne(userId: string, now: Date): Promise<Outcome> {
    if ((this._notBefore.get(userId) ?? 0) > now.getTime()) return 'skipped';

    const items = await this._pending.findByUserId(userId);
    const newest = items[items.length - 1];
    if (newest === undefined) return 'skipped';

    const staleBefore = now.getTime() - SMS_DIGEST_MAX_AGE_MS;
    const fresh = items.filter((item) => item.createdAt.getTime() >= staleBefore);
    if (fresh.length === 0) {
      await this._pending.deleteByUserId(userId, newest.createdAt);
      logger.warn(
        { job: JOB, userId, alerts: items.length },
        'daily text summary dropped: the alerts waited more than a week'
      );
      return 'dropped';
    }
    return this._send(userId, fresh, newest, now);
  }

  /**
   * One text for `fresh`, to the number the newest alert was queued with. Whatever happens,
   * only alerts up to `newest` are removed: one that arrives meanwhile waits for the next
   * summary.
   */
  private async _send(
    userId: string,
    fresh: readonly ISmsDigestPendingItem[],
    newest: ISmsDigestPendingItem,
    now: Date
  ): Promise<Outcome> {
    const subject = `SMS Digest (${fresh.length} alerts)`;
    // One segment: count + details link (joined email bodies ran to 10+ segments).
    const body = buildSmsDigestBody(fresh.length, this._options.webOrigin);
    try {
      await this._sender.sendTransactional(newest.phone, body, {
        userId,
        subject,
        templateName: 'sms_digest',
        triggeredBy: 'scheduled',
      });
    } catch (error: unknown) {
      // What an error says can name the number: only its code is kept.
      const reason = error instanceof SmsNotSentError ? error.reason : 'unexpected_error';
      if (error instanceof SmsNotSentError && error.kind === 'recipient') {
        this._notBefore.set(userId, now.getTime() + SMS_DIGEST_MIN_GAP_MS);
        await this._pending.deleteByUserId(userId, newest.createdAt);
        await this._logDropped(userId, newest.phone, subject, body, reason, now);
        logger.warn(
          { job: JOB, userId, reason, alerts: fresh.length },
          'daily text summary dropped: this number cannot be texted'
        );
        return 'dropped';
      }
      this._notBefore.set(userId, now.getTime() + SMS_DIGEST_RETRY_WAIT_MS);
      logger.warn(
        { job: JOB, userId, reason, alerts: fresh.length },
        'daily text summary not sent: it waits for the next attempt'
      );
      return 'waiting';
    }
    this._notBefore.set(userId, now.getTime() + SMS_DIGEST_MIN_GAP_MS);
    await this._pending.deleteByUserId(userId, newest.createdAt);
    return 'sent';
  }

  /** One row in the person's history, so "why did I get no summary" has an answer. */
  private async _logDropped(
    userId: string,
    phone: string,
    subject: string,
    body: string,
    reason: string,
    now: Date
  ): Promise<void> {
    await this._commLogs
      .create({
        userId,
        channel: 'sms',
        type: 'notification',
        subject,
        content: body,
        recipientPhone: phone,
        status: 'failed',
        failedAt: now,
        failureReason: reason,
        triggeredBy: 'scheduled',
        templateName: 'sms_digest',
      })
      .catch(() => {
        /* best effort */
      });
  }
}
