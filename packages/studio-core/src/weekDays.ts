import type { WeekDayLabel } from '@scholaracle/contracts';
import { calendarDayKey, calendarYmd } from './guidance/zonedTime';

/** Rolling horizon: today plus the next six local calendar days. */
export const WEEK_DAY_COUNT = 7;

export interface IWeekDaySlot {
  /** Local calendar day as YYYY-MM-DD. */
  readonly date: string;
  readonly label: WeekDayLabel;
}

const WEEKDAY_SHORT: readonly WeekDayLabel[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calendar-day arithmetic in `timeZone`, never ms arithmetic: adding 24 h
 * across a DST change can skip or repeat a local day.
 */
export function calendarDayOffset(now: Date, timeZone: string, offsetDays: number): string {
  const ymd = calendarYmd(now, timeZone);
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + offsetDays))
    .toISOString()
    .slice(0, 10);
}

function weekdayLabel(dayKey: string): WeekDayLabel {
  const index = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
  return WEEKDAY_SHORT[index] ?? 'Sun';
}

/** Today, Tomorrow, then short weekday names, for the next seven local days. */
export function buildWeekDays(now: Date, timeZone: string): IWeekDaySlot[] {
  const slots: IWeekDaySlot[] = [];
  for (let i = 0; i < WEEK_DAY_COUNT; i += 1) {
    const date = calendarDayOffset(now, timeZone, i);
    const label: WeekDayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayLabel(date);
    slots.push({ date, label });
  }
  return slots;
}

/** Local calendar day of an ISO instant, or undefined when it does not parse. */
export function localDayOf(iso: string | undefined, timeZone: string): string | undefined {
  if (iso === undefined || iso === '') return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return calendarDayKey(new Date(ms), timeZone);
}

/** True when `timeZone` is an IANA zone Intl can format. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    calendarDayKey(new Date(0), timeZone);
    return true;
  } catch {
    return false;
  }
}
