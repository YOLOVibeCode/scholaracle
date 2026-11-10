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

  it.each([
    ['Asia/Kolkata', '2026-11-08T12:30:00.000Z'], // UTC+5:30
    ['Asia/Kathmandu', '2026-11-08T12:15:00.000Z'], // UTC+5:45
    ['Australia/Adelaide', '2026-11-08T07:30:00.000Z'], // ACDT, UTC+10:30
    ['America/St_Johns', '2026-11-08T21:30:00.000Z'], // NST, UTC-3:30
    ['UTC', '2026-11-08T18:00:00.000Z'],
  ])('lands on the exact wall-clock hour in half-hour zones: %s', (zone, iso) => {
    const d = zonedLocalDate(zone, 2026, 11, 8, 18);
    expect(d.toISOString()).toBe(iso);
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
    expect(local).toBe('18:00');
  });
});
