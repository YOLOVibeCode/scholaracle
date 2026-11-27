import { quietHoursEnd } from './quietHours';

const TZ = 'America/Chicago';
const TEN_TO_SEVEN = { start: '22:00', end: '07:00' };

/** A Chicago wall-clock time in the first week of December 2026 (CST, six hours behind UTC). */
function chicago(day: number, hour: number, minute: number = 0): Date {
  return new Date(Date.UTC(2026, 11, day, hour + 6, minute));
}

describe('quietHoursEnd', () => {
  describe('overnight hours, 10 pm to 7 am', () => {
    it('are not on in the afternoon', () => {
      expect(quietHoursEnd(chicago(3, 16), TZ, TEN_TO_SEVEN)).toBeNull();
    });

    it('are not on a minute before they start', () => {
      expect(quietHoursEnd(chicago(3, 21, 59), TZ, TEN_TO_SEVEN)).toBeNull();
    });

    it('end tomorrow at 7 am when they began this evening', () => {
      expect(quietHoursEnd(chicago(3, 22), TZ, TEN_TO_SEVEN)).toEqual(chicago(4, 7));
      expect(quietHoursEnd(chicago(3, 23, 59), TZ, TEN_TO_SEVEN)).toEqual(chicago(4, 7));
    });

    it('end today at 7 am after midnight', () => {
      expect(quietHoursEnd(chicago(4, 0), TZ, TEN_TO_SEVEN)).toEqual(chicago(4, 7));
      expect(quietHoursEnd(chicago(4, 6, 59), TZ, TEN_TO_SEVEN)).toEqual(chicago(4, 7));
    });

    it('are over at 7 am', () => {
      expect(quietHoursEnd(chicago(4, 7), TZ, TEN_TO_SEVEN)).toBeNull();
    });

    it('end on the first of next month when they began on the last evening of this one', () => {
      const lastEveningOfNovember = new Date('2026-12-01T05:30:00.000Z'); // 30 Nov, 11:30 pm
      expect(quietHoursEnd(lastEveningOfNovember, TZ, TEN_TO_SEVEN)).toEqual(chicago(1, 7));
    });
  });

  describe('hours within one day, noon to 1 pm', () => {
    const lunch = { start: '12:00', end: '13:00' };

    it('are on only inside them and end the same day', () => {
      expect(quietHoursEnd(chicago(3, 11, 59), TZ, lunch)).toBeNull();
      expect(quietHoursEnd(chicago(3, 12), TZ, lunch)).toEqual(chicago(3, 13));
      expect(quietHoursEnd(chicago(3, 12, 59), TZ, lunch)).toEqual(chicago(3, 13));
      expect(quietHoursEnd(chicago(3, 13), TZ, lunch)).toBeNull();
    });
  });

  it('are read to the minute, not the hour', () => {
    const halfPast = { start: '22:30', end: '06:30' };
    expect(quietHoursEnd(chicago(3, 22, 15), TZ, halfPast)).toBeNull();
    expect(quietHoursEnd(chicago(3, 22, 30), TZ, halfPast)).toEqual(chicago(4, 6, 30));
    expect(quietHoursEnd(chicago(4, 6, 15), TZ, halfPast)).toEqual(chicago(4, 6, 30));
    expect(quietHoursEnd(chicago(4, 6, 30), TZ, halfPast)).toBeNull();
  });

  it("are on the household's clock, not the server's", () => {
    // 4:30 am UTC is 10:30 pm the evening before in Chicago and 10 am in Kolkata.
    const instant = new Date('2026-12-04T04:30:00.000Z');
    expect(quietHoursEnd(instant, 'America/Chicago', TEN_TO_SEVEN)).toEqual(chicago(4, 7));
    expect(quietHoursEnd(instant, 'Asia/Kolkata', TEN_TO_SEVEN)).toBeNull();
  });

  it('end at 7 am by the new clock on the night the clocks go forward', () => {
    // Saturday 13 March 2027, 11 pm CST. Sunday 7 am is CDT, five hours behind UTC.
    expect(quietHoursEnd(new Date('2027-03-14T05:00:00.000Z'), TZ, TEN_TO_SEVEN)).toEqual(
      new Date('2027-03-14T12:00:00.000Z')
    );
  });

  describe('on the nights the clocks change', () => {
    // A caller holds its message until the time returned and then asks again. A time that
    // is not after now, or is still inside quiet hours, would hand the message straight back.
    it('end at 3 am when they were to end at 2:30 am, a time the clock skips going forward', () => {
      // Saturday 13 March 2027, 11 pm CST. At 2 am the clock goes to 3 am.
      expect(
        quietHoursEnd(new Date('2027-03-14T05:00:00.000Z'), TZ, { start: '22:00', end: '02:30' })
      ).toEqual(new Date('2027-03-14T08:00:00.000Z'));
    });

    it('end the second time 1:30 am comes round when the clock has already gone back', () => {
      // Sunday 7 November 2027, 1:10 am for the second time (CST). The first 1:30 am has passed.
      expect(
        quietHoursEnd(new Date('2027-11-07T07:10:00.000Z'), TZ, { start: '22:00', end: '01:30' })
      ).toEqual(new Date('2027-11-07T07:30:00.000Z'));
    });

    it.each([
      ['the clocks go forward', '2027-03-13T12:00:00.000Z'],
      ['the clocks go back', '2027-11-06T12:00:00.000Z'],
      ['nothing changes', '2026-12-03T12:00:00.000Z'],
    ])('always end after now, at a time that is not quiet, when %s', (_label, fromIso) => {
      const from = new Date(fromIso).getTime();
      const settings = [
        TEN_TO_SEVEN,
        { start: '22:00', end: '02:30' },
        { start: '23:30', end: '01:30' },
        { start: '01:15', end: '02:45' },
        { start: '12:00', end: '13:00' },
        { start: '00:00', end: '23:59' },
      ];
      for (const timezone of [TZ, 'Australia/Lord_Howe', 'Asia/Kolkata']) {
        for (const quietHours of settings) {
          for (let minutes = 0; minutes < 48 * 60; minutes += 10) {
            const now = new Date(from + minutes * 60_000);
            const until = quietHoursEnd(now, timezone, quietHours);
            if (until === null) continue;
            const where = `${timezone} ${quietHours.start}-${quietHours.end} at ${now.toISOString()}`;
            expect([where, until.getTime() > now.getTime()]).toEqual([where, true]);
            expect([where, quietHoursEnd(until, timezone, quietHours)]).toEqual([where, null]);
          }
        }
      }
    });
  });

  it('are never on when there are none', () => {
    expect(quietHoursEnd(chicago(4, 3), TZ)).toBeNull();
    expect(quietHoursEnd(chicago(4, 3), TZ, { start: '00:00', end: '00:00' })).toBeNull();
  });

  it.each([
    ['an hour past 23', { start: '24:00', end: '07:00' }],
    ['a minute past 59', { start: '22:60', end: '07:00' }],
    ['a missing leading zero', { start: '22:00', end: '7:00' }],
    ['words', { start: 'late', end: 'early' }],
    ['nothing', { start: '', end: '' }],
  ])('are never on when a time is not a time of day: %s', (_label, quietHours) => {
    expect(quietHoursEnd(chicago(4, 3), TZ, quietHours)).toBeNull();
  });
});
