/**
 * Digest helper functions — pure, testable logic extracted from worker.
 * Follows TDD (M1) and ISP (M2) principles.
 */

import type { Db } from 'mongodb';

export const UTC_DAY_TO_KEY: readonly string[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DIGEST_UTC_HOUR = 18;

/**
 * Returns true if the given date (YYYY-MM-DD) falls in a gap between academic terms.
 */
export async function isInHoliday(database: Db, userId: string, dateYmd: string): Promise<boolean> {
  const terms = await database
    .collection('slc_academic_terms')
    .find({ userId, deletedAt: null })
    .toArray();
  if (terms.length === 0) return false;

  const ranges: { start: string; end: string }[] = [];
  for (const t of terms) {
    const record = t['record'] as Record<string, unknown> | undefined;
    const start = record?.['startDate'] as string | undefined;
    const end = record?.['endDate'] as string | undefined;
    if (start && end) ranges.push({ start, end });
  }
  if (ranges.length === 0) return false;

  ranges.sort((a, b) => a.start.localeCompare(b.start));
  const firstStart = ranges[0]!.start;
  const lastEnd = ranges[ranges.length - 1]!.end;
  if (dateYmd < firstStart || dateYmd > lastEnd) return true;
  for (let i = 0; i < ranges.length - 1; i++) {
    const gapStart = ranges[i]!.end;
    const gapEnd = ranges[i + 1]!.start;
    if (dateYmd > gapStart && dateYmd < gapEnd) return true;
  }
  return false;
}

/**
 * Returns the start date (YYYY-MM-DD) of the current semester for assignment filtering.
 * Uses slc_academic_terms when available; otherwise Jan 1 or Aug 1 heuristic.
 */
export async function getCurrentSemesterStart(
  database: Db,
  userId: string,
  referenceDate: Date = new Date()
): Promise<string> {
  const todayYmd = referenceDate.toISOString().slice(0, 10);
  const terms = await database
    .collection('slc_academic_terms')
    .find({ userId, deletedAt: null })
    .toArray();

  for (const t of terms) {
    const record = t['record'] as Record<string, unknown> | undefined;
    const start = record?.['startDate'] as string | undefined;
    const end = record?.['endDate'] as string | undefined;
    if (start && end && todayYmd >= start && todayYmd <= end) return start;
  }

  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  if (month >= 8) return `${year}-08-01`;
  return `${year}-01-01`;
}

export function getActiveSlotsForUser(
  user: {
    preferences?: {
      notifications?: {
        digestSchedule?: {
          weekdaySlots?: readonly { time: string; enabled: boolean }[];
          weekendSlots?: readonly { time: string; enabled: boolean }[];
          schoolDays?: readonly string[];
        };
      };
    };
  },
  currentHhmm: string,
  currentUtcDayKey: string
): boolean {
  const schedule = user?.preferences?.notifications?.digestSchedule;
  const schoolDays = schedule?.schoolDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'];
  const isSchoolDay = schoolDays.includes(currentUtcDayKey);
  const slots = isSchoolDay ? schedule?.weekdaySlots : schedule?.weekendSlots;
  if (Array.isArray(slots) && slots.length > 0) {
    return slots.some((s) => s.enabled && s.time === currentHhmm);
  }
  return false;
}

export function shouldFlushLegacy(
  user: {
    preferences?: {
      notifications?: {
        digestSchedule?: { digestTimes?: readonly string[] };
      };
    };
  },
  currentHhmm: string,
  currentHour: number
): boolean {
  const digestTimes = user?.preferences?.notifications?.digestSchedule?.digestTimes;
  const hasCustomTimes = Array.isArray(digestTimes) && digestTimes.length > 0;
  if (hasCustomTimes) return digestTimes.includes(currentHhmm);
  return currentHour === DIGEST_UTC_HOUR;
}
