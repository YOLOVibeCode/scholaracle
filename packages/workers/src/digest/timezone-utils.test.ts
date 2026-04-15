import { userLocalHhmm, userLocalDayKey, userLocalDateYmd } from './timezone-utils';

describe('timezone-utils', () => {
  describe('userLocalHhmm', () => {
    it('converts UTC to Eastern time (EST, UTC-5)', () => {
      // Jan 15 is EST (no DST). 05:00 UTC = 00:00 EST
      const d = new Date('2026-01-15T05:00:00.000Z');
      expect(userLocalHhmm(d, 'America/New_York')).toBe('00:00');
    });

    it('converts UTC noon to PST (UTC-8)', () => {
      const utcNoon = new Date('2026-01-15T20:30:00.000Z'); // 12:30 PST
      expect(userLocalHhmm(utcNoon, 'America/Los_Angeles')).toBe('12:30');
    });

    it('converts UTC time to same time in UTC timezone', () => {
      const utc = new Date('2026-04-12T09:00:00.000Z');
      expect(userLocalHhmm(utc, 'UTC')).toBe('09:00');
    });

    it('handles date boundary crossing (UTC evening -> next day in Tokyo)', () => {
      const utcEvening = new Date('2026-04-12T18:00:00.000Z'); // 03:00 next day in JST
      expect(userLocalHhmm(utcEvening, 'Asia/Tokyo')).toBe('03:00');
    });
  });

  describe('userLocalDayKey', () => {
    it('returns correct day key for EST', () => {
      // 2026-04-12 is a Sunday in UTC, also Sunday in EST
      const sundayUtc = new Date('2026-04-12T12:00:00.000Z');
      expect(userLocalDayKey(sundayUtc, 'America/New_York')).toBe('sun');
    });

    it('handles day boundary: late UTC Saturday -> already Sunday in Tokyo', () => {
      // Saturday 2026-04-11 23:00 UTC = Sunday 2026-04-12 08:00 JST
      const saturdayUtc = new Date('2026-04-11T23:00:00.000Z');
      expect(userLocalDayKey(saturdayUtc, 'Asia/Tokyo')).toBe('sun');
      expect(userLocalDayKey(saturdayUtc, 'America/New_York')).toBe('sat');
    });
  });

  describe('userLocalDateYmd', () => {
    it('returns correct date for UTC', () => {
      const d = new Date('2026-04-12T12:00:00.000Z');
      expect(userLocalDateYmd(d, 'UTC')).toBe('2026-04-12');
    });

    it('handles date boundary: late UTC -> next day in Tokyo', () => {
      const d = new Date('2026-04-11T23:00:00.000Z');
      expect(userLocalDateYmd(d, 'Asia/Tokyo')).toBe('2026-04-12');
      expect(userLocalDateYmd(d, 'America/New_York')).toBe('2026-04-11');
    });

    it('handles DST transition (spring forward)', () => {
      // 2026-03-08 is DST spring forward in US
      const beforeSpringForward = new Date('2026-03-08T06:00:00.000Z'); // 01:00 EST
      expect(userLocalDateYmd(beforeSpringForward, 'America/New_York')).toBe('2026-03-08');
    });
  });
});
