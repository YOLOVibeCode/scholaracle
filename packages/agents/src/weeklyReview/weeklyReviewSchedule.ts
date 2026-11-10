import { calendarDayKey, isValidTimeZone, zonedLocalDate } from '@scholaracle/studio-core';

/**
 * When the weekly review is due: Sunday 18:00 on the student's wall clock
 * (student review spec §3.3). All arithmetic is on local calendar days and
 * `zonedLocalDate`, never on fixed UTC offsets, so a DST change the same
 * weekend moves the instant with the clock instead of landing an hour off.
 */

/** 0 = Sunday, as `Date#getUTCDay` counts. */
export const WEEKLY_REVIEW_WEEKDAY = 0;
export const WEEKLY_REVIEW_HOUR = 18;

export interface IWeeklyReviewDue {
  /** The instant Sunday 18:00 local happened (or happens) for this zone. */
  readonly dueAt: Date;
  /** ISO 8601 week of that Sunday, e.g. `2026-W45`; the idempotency key with the student id. */
  readonly weekKey: string;
  /** The Sunday's local calendar day as YYYY-MM-DD. */
  readonly localDate: string;
}

function ymd(dayKey: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const [year, month, day] = dayKey.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** Calendar-day arithmetic on a YYYY-MM-DD key (UTC midnight, so no DST can bite). */
export function shiftCalendarDay(dayKey: string, days: number): string {
  const { year, month, day } = ymd(dayKey);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
}

/**
 * ISO 8601 week id for a calendar day: weeks start Monday and week 1 holds the
 * year's first Thursday, so a Sunday in early January can belong to the previous
 * year's last week (2027-01-03 → 2026-W53).
 */
export function isoWeekKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  // Move to the Thursday of this ISO week; its calendar year is the ISO year.
  date.setUTCDate(date.getUTCDate() + 4 - isoWeekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * The most recent Sunday 18:00 in `timeZone` that is at or before `now`.
 * Sunday morning still belongs to the previous week's review; the moment the
 * local clock reads 18:00 the new one is due. Unknown zones fall back to UTC.
 */
export function latestWeeklyReviewDue(now: Date, timeZone: string): IWeeklyReviewDue {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const today = calendarDayKey(now, zone);
  const back = (weekdayOf(today) - WEEKLY_REVIEW_WEEKDAY + 7) % 7;
  let sunday = shiftCalendarDay(today, -back);
  let dueAt = dueInstant(sunday, zone);
  if (dueAt.getTime() > now.getTime()) {
    sunday = shiftCalendarDay(sunday, -7);
    dueAt = dueInstant(sunday, zone);
  }
  return { dueAt, weekKey: isoWeekKey(sunday), localDate: sunday };
}

function dueInstant(dayKey: string, zone: string): Date {
  const { year, month, day } = ymd(dayKey);
  return zonedLocalDate(zone, year, month, day, WEEKLY_REVIEW_HOUR);
}
