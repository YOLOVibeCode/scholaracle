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

function localHourOf(date: Date, timeZone: string): number {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((p) => p.type === 'hour')?.value;
  const hour = Number(hourPart);
  return hour === 24 ? 0 : hour;
}

/**
 * Instant that is `hour`:00 on `year-month-day` in `timeZone`.
 */
export function zonedLocalDate(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    const local = calendarYmd(new Date(utc), timeZone);
    const gotHour = localHourOf(new Date(utc), timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour);
    const got = Date.UTC(local.year, local.month - 1, local.day, gotHour);
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
