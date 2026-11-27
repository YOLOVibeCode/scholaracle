import { localClock, zonedLocalDate } from './zonedTime';

/** A household's quiet hours, as two wall-clock times: `22:00` to `07:00`. */
export interface IQuietHoursConfig {
  readonly start: string;
  readonly end: string;
}

const MINUTES_IN_HOUR = 60;
const STEP_MS = 15 * 60 * 1000;
/** Clocks change by an hour, two at the most. Eight steps of a quarter of an hour cover it. */
const MAX_STEPS = 8;

/** `HH:mm` as minutes after midnight. Null when it is not a time of day. */
function minutesAfterMidnight(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * MINUTES_IN_HOUR + minute;
}

/** Quiet hours as minutes after midnight. They run overnight when `start` is after `end`. */
interface IQuietSpan {
  readonly start: number;
  readonly end: number;
}

function quietSpan(quietHours?: IQuietHoursConfig): IQuietSpan | null {
  if (quietHours === undefined) return null;
  const start = minutesAfterMidnight(quietHours.start);
  const end = minutesAfterMidnight(quietHours.end);
  if (start === null || end === null) return null;
  return { start, end };
}

/** From `start` up to, not including, `end`. The same time for both is no time at all. */
function isQuiet(minute: number, span: IQuietSpan): boolean {
  return span.start > span.end
    ? minute >= span.start || minute < span.end
    : minute >= span.start && minute < span.end;
}

function minuteOfDay(at: Date, timezone: string): number {
  const local = localClock(at, timezone);
  return local.hour * MINUTES_IN_HOUR + local.minute;
}

/**
 * When the quiet hours that `now` falls in end, on the wall clock in `timezone`. Null when
 * `now` is outside them, or there are none (not set, start equal to end, or not a time).
 *
 * Quiet hours mean "not now", so a caller holds its message until the time returned and
 * asks again then. The time returned is therefore always after `now` and never itself
 * inside quiet hours: otherwise the caller would be handed its message straight back.
 */
export function quietHoursEnd(
  now: Date,
  timezone: string,
  quietHours?: IQuietHoursConfig
): Date | null {
  const span = quietSpan(quietHours);
  if (span === null) return null;
  const local = localClock(now, timezone);
  const minute = local.hour * MINUTES_IN_HOUR + local.minute;
  if (!isQuiet(minute, span)) return null;

  // Overnight hours that began this evening end tomorrow; any others end today.
  const daysAhead = span.start > span.end && minute >= span.start ? 1 : 0;
  let until = zonedLocalDate(
    timezone,
    local.year,
    local.month,
    local.day + daysAhead,
    Math.floor(span.end / MINUTES_IN_HOUR),
    span.end % MINUTES_IN_HOUR
  );

  // On the two nights a year the clocks change, a wall-clock time can be skipped (2:30 am
  // when they go forward) or come round twice (1:30 am when they go back). The instant
  // worked out for it can then be in the past or still inside quiet hours, so it is moved
  // on until it is neither.
  const stillWaiting = (at: Date): boolean =>
    at.getTime() <= now.getTime() || isQuiet(minuteOfDay(at, timezone), span);
  for (let step = 0; step < MAX_STEPS && stillWaiting(until); step += 1) {
    until = new Date(until.getTime() + STEP_MS);
  }
  return until;
}
