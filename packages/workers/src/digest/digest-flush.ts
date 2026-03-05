/**
 * Digest flush orchestration — scheduler-driven digest sending.
 * Uses helper functions and DigestSender to flush pending digests.
 */

import type { Db } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import { EmailDigestPendingRepository, CommunicationLogRepository, UserRepository } from '@scholaracle/database';
import type { DigestInsightService } from '@scholaracle/agents';
import { DigestSender } from './digest-sender';
import {
  UTC_DAY_TO_KEY,
  isInHoliday,
  getActiveSlotsForUser,
  shouldFlushLegacy,
} from './digest-helpers';
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
  const currentHhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const currentHour = now.getUTCHours();
  const currentUtcDayKey = UTC_DAY_TO_KEY[now.getUTCDay()]!;
  const todayYmd = now.toISOString().slice(0, 10);

  for (const userId of userIds) {
    try {
      const user = await userRepo.findById(userId);
      if (!user) continue;

      const schedule = user.preferences?.notifications?.digestSchedule;
      const hasSlots =
        (schedule?.weekdaySlots?.length ?? 0) > 0 ||
        (schedule?.weekendSlots?.length ?? 0) > 0;
      const shouldFlush = hasSlots
        ? getActiveSlotsForUser(user, currentHhmm, currentUtcDayKey)
        : shouldFlushLegacy(user, currentHhmm, currentHour);
      if (!shouldFlush) continue;

      const holidayMode = schedule?.holidayMode ?? 'normal';
      const inHoliday = await isInHoliday(database, userId, todayYmd);
      if (holidayMode === 'pause' && inHoliday) continue;
      const itemFilter =
        holidayMode === 'reduced' && inHoliday
          ? (item: IEmailDigestPendingItem) => item.severity === 'critical'
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
      await digestSender.sendDigestForUser(userId, itemFilter);
    } catch (err) {
      console.error(`[EmailDigest] Error processing user ${userId}:`, err);
    }
  }
}
