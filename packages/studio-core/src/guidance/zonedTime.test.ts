import { calendarDayKey, zonedLocalDate, atLocalHourOnCalendarDay } from './zonedTime';

describe('zonedTime', () => {
  it('formats a calendar day in the parent timezone', () => {
    const lateUtc = new Date('2026-08-26T03:30:00.000Z');
    expect(calendarDayKey(lateUtc, 'America/New_York')).toBe('2026-08-25');
    expect(calendarDayKey(lateUtc, 'UTC')).toBe('2026-08-26');
  });

  it('snaps T-48h to 4pm Eastern on that calendar day', () => {
    const instant = new Date('2026-08-25T20:00:00.000Z');
    const four = atLocalHourOnCalendarDay(instant, 'America/New_York', 16);
    expect(calendarDayKey(four, 'America/New_York')).toBe('2026-08-25');
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hourCycle: 'h23',
      })
        .formatToParts(four)
        .find((p) => p.type === 'hour')?.value
    );
    expect(hour).toBe(16);
  });

  it('builds a zoned local date', () => {
    const d = zonedLocalDate('America/Chicago', 2026, 1, 15, 16);
    expect(calendarDayKey(d, 'America/Chicago')).toBe('2026-01-15');
  });
});
