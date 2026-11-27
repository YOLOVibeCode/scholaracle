/**
 * Calendar helpers for the guidance ladder (4pm local send window, daily nudge cap).
 */

export function calendarDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function calendarYmd(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const num = (type: string): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return Number(value);
  };
  return { year: num('year'), month: num('month'), day: num('day') };
}

/**
 * Local wall-clock hour and minute. Minutes matter: Asia/Kolkata (+5:30), Australia/Adelaide
 * (+9:30/+10:30) and Asia/Kathmandu (+5:45) are not whole hours off UTC, and comparing hours
 * alone converged on 18:30 when 18:00 was asked for.
 */
function localTimeOf(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const hour = part('hour');
  return { hour: hour === 24 ? 0 : hour, minute: part('minute') };
}

export interface ILocalClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** The date and the time on a wall clock in `timeZone` at `date`. */
export function localClock(date: Date, timeZone: string): ILocalClock {
  return { ...calendarYmd(date, timeZone), ...localTimeOf(date, timeZone) };
}

/**
 * Instant that is `hour`:`minute` on `year-month-day` in `timeZone`. A day past the end of
 * the month rolls into the next, so "the day after" can be asked for as `day + 1`.
 */
export function zonedLocalDate(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 8; i += 1) {
    const local = calendarYmd(new Date(utc), timeZone);
    const time = localTimeOf(new Date(utc), timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(local.year, local.month - 1, local.day, time.hour, time.minute);
    const delta = wanted - got;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function atLocalHourOnCalendarDay(instant: Date, timeZone: string, hour: number): Date {
  const ymd = calendarYmd(instant, timeZone);
  return zonedLocalDate(timeZone, ymd.year, ymd.month, ymd.day, hour);
}
