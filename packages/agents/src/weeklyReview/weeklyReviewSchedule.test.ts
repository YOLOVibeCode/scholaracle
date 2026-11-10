import {
  WEEKLY_REVIEW_HOUR,
  WEEKLY_REVIEW_WEEKDAY,
  isoWeekKey,
  latestWeeklyReviewDue,
  shiftCalendarDay,
} from './weeklyReviewSchedule';

describe('weeklyReviewSchedule', () => {
  it('is Sunday at 18:00 local', () => {
    expect(WEEKLY_REVIEW_WEEKDAY).toBe(0);
    expect(WEEKLY_REVIEW_HOUR).toBe(18);
  });

  describe('isoWeekKey', () => {
    it.each([
      ['2026-11-08', '2026-W45'], // a Sunday closes ISO week 45
      ['2026-11-02', '2026-W45'], // the Monday that opens it
      ['2026-11-01', '2026-W44'],
      ['2026-01-04', '2026-W01'], // Sunday after the first Thursday
      ['2027-01-03', '2026-W53'], // Sunday before 2027's first Thursday: still last year
      ['2027-01-04', '2027-W01'],
      ['2026-12-31', '2026-W53'],
    ])('%s → %s', (day, key) => {
      expect(isoWeekKey(day)).toBe(key);
    });
  });

  it('shiftCalendarDay crosses month and year boundaries', () => {
    expect(shiftCalendarDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftCalendarDay('2026-12-28', 7)).toBe('2027-01-04');
    expect(shiftCalendarDay('2026-03-01', -7)).toBe('2026-02-22');
  });

  describe('latestWeeklyReviewDue (wall clock, not fixed offsets)', () => {
    it.each([
      // zone, now (UTC), expected dueAt (UTC), local Sunday, week key, note
      [
        'America/Chicago',
        '2026-11-09T00:00:00.000Z',
        '2026-11-09T00:00:00.000Z',
        '2026-11-08',
        '2026-W45',
        'exactly 18:00 CST is due now',
      ],
      [
        'America/Chicago',
        '2026-11-08T23:59:00.000Z',
        '2026-11-02T00:00:00.000Z',
        '2026-11-01',
        '2026-W44',
        'a minute before 18:00 still belongs to last week',
      ],
      [
        'America/Chicago',
        '2026-11-04T15:00:00.000Z',
        '2026-11-02T00:00:00.000Z',
        '2026-11-01',
        '2026-W44',
        'midweek: the Sunday that just passed',
      ],
      [
        'America/Chicago',
        '2026-11-01T23:30:00.000Z',
        '2026-10-25T23:00:00.000Z',
        '2026-10-25',
        '2026-W43',
        'fall back (Nov 1): 17:30 CST is before 18:00; previous Sunday was 18:00 CDT (UTC-5)',
      ],
      [
        'America/Chicago',
        '2026-11-02T00:00:00.000Z',
        '2026-11-02T00:00:00.000Z',
        '2026-11-01',
        '2026-W44',
        'fall back (Nov 1): 18:00 CST is UTC-6, one hour later in UTC than a week before',
      ],
      [
        'America/Chicago',
        '2026-03-08T22:59:00.000Z',
        '2026-03-02T00:00:00.000Z',
        '2026-03-01',
        '2026-W09',
        'spring forward (Mar 8): 17:59 CDT is not yet due; last Sunday was 18:00 CST',
      ],
      [
        'America/Chicago',
        '2026-03-08T23:00:00.000Z',
        '2026-03-08T23:00:00.000Z',
        '2026-03-08',
        '2026-W10',
        'spring forward (Mar 8): 18:00 CDT is UTC-5',
      ],
      [
        'Europe/London',
        '2026-10-25T18:00:00.000Z',
        '2026-10-25T18:00:00.000Z',
        '2026-10-25',
        '2026-W43',
        'BST ended that morning: 18:00 GMT',
      ],
      [
        'Europe/London',
        '2026-10-25T17:30:00.000Z',
        '2026-10-18T17:00:00.000Z',
        '2026-10-18',
        '2026-W42',
        'before 18:00 GMT; the previous Sunday was 18:00 BST (UTC+1)',
      ],
      [
        'Asia/Kolkata',
        '2026-11-08T12:30:00.000Z',
        '2026-11-08T12:30:00.000Z',
        '2026-11-08',
        '2026-W45',
        'UTC+5:30, no DST',
      ],
      [
        'Pacific/Auckland',
        '2026-11-08T05:00:00.000Z',
        '2026-11-08T05:00:00.000Z',
        '2026-11-08',
        '2026-W45',
        'NZDT is UTC+13 in November',
      ],
      [
        'Pacific/Auckland',
        '2026-11-08T04:59:00.000Z',
        '2026-11-01T05:00:00.000Z',
        '2026-11-01',
        '2026-W44',
        'a minute early in Auckland',
      ],
      [
        'UTC',
        '2027-01-03T18:00:00.000Z',
        '2027-01-03T18:00:00.000Z',
        '2027-01-03',
        '2026-W53',
        'year boundary keeps the ISO year of the week',
      ],
      [
        'Not/AZone',
        '2026-11-08T18:00:00.000Z',
        '2026-11-08T18:00:00.000Z',
        '2026-11-08',
        '2026-W45',
        'unknown zone falls back to UTC',
      ],
    ])('%s at %s → due %s (%s, %s): %s', (zone, nowIso, dueIso, localDate, weekKey) => {
      const due = latestWeeklyReviewDue(new Date(nowIso), zone);
      expect(due.dueAt.toISOString()).toBe(dueIso);
      expect(due.localDate).toBe(localDate);
      expect(due.weekKey).toBe(weekKey);
    });

    it('never returns a due instant after now', () => {
      const zones = ['America/Los_Angeles', 'Europe/Berlin', 'Australia/Sydney', 'UTC'];
      const start = Date.parse('2026-10-20T00:00:00.000Z');
      for (const zone of zones) {
        for (let h = 0; h < 24 * 21; h += 1) {
          const now = new Date(start + h * 3_600_000);
          const due = latestWeeklyReviewDue(now, zone);
          expect(due.dueAt.getTime()).toBeLessThanOrEqual(now.getTime());
          // and the next Sunday 18:00 is still ahead of now
          expect(now.getTime() - due.dueAt.getTime()).toBeLessThan(7 * 86_400_000 + 3_600_000);
        }
      }
    });
  });
});
