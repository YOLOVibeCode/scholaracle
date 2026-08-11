/**
 * Digest flush orchestration — scheduler-driven digest sending.
 * Uses helper functions and DigestSender to flush pending digests.
 */

import type { Db } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import { logger } from '../logger';
import {
  EmailDigestPendingRepository,
  CommunicationLogRepository,
  UserRepository,
} from '@scholaracle/database';
import type { DigestInsightService } from '@scholaracle/agents';
import { DigestSender } from './digest-sender';
import { isInHoliday, getActiveSlotsForUser, shouldFlushLegacy } from './digest-helpers';
import { userLocalHhmm, userLocalDayKey, userLocalDateYmd } from './timezone-utils';
import type { IEmailDigestPendingItem } from '@scholaracle/database';

/**
 * Flush pending email digests for users whose configured slots match current UTC day and HH:mm.
 * Uses weekdaySlots/weekendSlots and schoolDays when present; falls back to digestTimes or DIGEST_UTC_HOUR.
 * Runs every 60 seconds; each user is flushed at most once per scheduled time.
 */
export async function flushEmailDigests(
  database: Db,
  transport: IEmailTransport,
  fromEmail: string,
  fromName: string,
  dashboardBaseUrl: string,
  insightService?: DigestInsightService
): Promise<void> {
  const repo = new EmailDigestPendingRepository(database);
  const userRepo = new UserRepository(database);
  const commLogRepo = new CommunicationLogRepository(database);
  const userIds = await repo.getDistinctUserIds();
  if (userIds.length === 0) return;

  const now = new Date();

  for (const userId of userIds) {
    try {
      const user = await userRepo.findById(userId);
      if (!user) continue;

      const tz = (user as { timezone?: string }).timezone ?? 'America/New_York';
      const currentHhmm = userLocalHhmm(now, tz);
      const currentDayKey = userLocalDayKey(now, tz);
      const todayYmd = userLocalDateYmd(now, tz);
      const currentHour = parseInt(currentHhmm.slice(0, 2), 10);

      const schedule = user.preferences?.notifications?.digestSchedule;

      // Auto-send, snooze, and recipient checks
      if (schedule?.autoSend === false) continue;
      if (schedule?.snoozeUntil && todayYmd < schedule.snoozeUntil) continue;
      if (schedule?.recipients === 'nobody') continue;

      const hasSlots =
        (schedule?.weekdaySlots?.length ?? 0) > 0 || (schedule?.weekendSlots?.length ?? 0) > 0;
      const shouldFlush = hasSlots
        ? getActiveSlotsForUser(user, currentHhmm, currentDayKey)
        : shouldFlushLegacy(user, currentHhmm, currentHour);
      if (!shouldFlush) continue;

      const holidayMode = schedule?.holidayMode ?? 'normal';
      const inHoliday = await isInHoliday(database, userId, todayYmd);
      if (holidayMode === 'pause' && inHoliday) continue;
      const itemFilter =
        holidayMode === 'reduced' && inHoliday
          ? (item: IEmailDigestPendingItem): boolean => item.severity === 'critical'
          : undefined;

      const recipientMode = schedule?.recipients ?? 'everybody';
      const allowedRecipients =
        recipientMode === 'specific'
          ? ((schedule?.specificRecipients as string[] | undefined) ?? [])
          : undefined;

      const digestSender = new DigestSender(
        database,
        transport,
        fromEmail,
        fromName,
        dashboardBaseUrl,
        repo,
        commLogRepo,
        insightService
      );
      await digestSender.sendDigestForUser(userId, itemFilter, allowedRecipients);
    } catch (err) {
      logger.error({ err, userId, job: 'email-digest' }, 'error processing user digest');
    }
  }
}
