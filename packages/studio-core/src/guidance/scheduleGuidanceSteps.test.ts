import {
  LADDER_STEPS,
  ladderFireTime,
  ladderStepEnd,
  scheduleGuidanceSteps,
  toGuidanceJobData,
} from './scheduleGuidanceSteps';

describe('ladderFireTime', () => {
  const CHICAGO = 'America/Chicago';
  /** Thursday 3 December 2026, 11:59 pm in Chicago. */
  const due = new Date('2026-12-04T05:59:00.000Z');

  it('runs the two before the deadline at 4 pm local, two days ahead and on the day', () => {
    expect(ladderFireTime('t48h', due, CHICAGO)).toEqual(new Date('2026-12-01T22:00:00.000Z'));
    expect(ladderFireTime('t18h', due, CHICAGO)).toEqual(new Date('2026-12-03T22:00:00.000Z'));
  });

  it('runs the two after the deadline 12 and 72 hours after it, to the minute', () => {
    expect(ladderFireTime('t12h', due, CHICAGO)).toEqual(new Date('2026-12-04T17:59:00.000Z'));
    expect(ladderFireTime('t72h', due, CHICAGO)).toEqual(new Date('2026-12-07T05:59:00.000Z'));
  });

  it('uses 4 pm on the wall clock where the family lives', () => {
    // The same instant is due "Thursday 11:59 pm" in Chicago and "Friday 12:59 am" in New York.
    expect(ladderFireTime('t18h', due, 'America/New_York')).toEqual(
      new Date('2026-12-03T21:00:00.000Z')
    );
  });

  it('never runs a before-due reminder after the deadline, whatever the hour it falls at', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const dueAt = new Date(Date.UTC(2026, 11, 3, hour, 30));
      for (const step of ['t48h', 't18h'] as const) {
        const fireAt = ladderFireTime(step, dueAt, CHICAGO);
        expect(fireAt.getTime()).toBeLessThan(dueAt.getTime());
      }
      expect(ladderFireTime('t48h', dueAt, CHICAGO).getTime()).toBeLessThan(
        ladderFireTime('t18h', dueAt, CHICAGO).getTime()
      );
    }
  });
});

describe('ladderStepEnd', () => {
  const CHICAGO = 'America/Chicago';
  const due = new Date('2026-12-04T05:59:00.000Z');

  it('ends each reminder when the next is due, and the last before-due one at the deadline', () => {
    expect(ladderStepEnd('t48h', due, CHICAGO)).toEqual(ladderFireTime('t18h', due, CHICAGO));
    expect(ladderStepEnd('t18h', due, CHICAGO)).toEqual(due);
    expect(ladderStepEnd('t12h', due, CHICAGO)).toEqual(ladderFireTime('t72h', due, CHICAGO));
  });

  it('gives the last reminder a day', () => {
    expect(ladderStepEnd('t72h', due, CHICAGO)).toEqual(new Date('2026-12-08T05:59:00.000Z'));
  });

  it('always ends a reminder after it starts', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const dueAt = new Date(Date.UTC(2026, 11, 3, hour, 30));
      for (const step of LADDER_STEPS) {
        expect(ladderStepEnd(step, dueAt, CHICAGO).getTime()).toBeGreaterThan(
          ladderFireTime(step, dueAt, CHICAGO).getTime()
        );
      }
    }
  });
});

describe('scheduleGuidanceSteps', () => {
  const TZ = 'America/New_York';
  const due = new Date('2026-08-27T16:00:00.000Z');

  const HOUR_MS = 60 * 60 * 1000;
  const hoursAfterDue = (hours: number): Date => new Date(due.getTime() + hours * HOUR_MS);

  it('leaves out a reminder before the deadline once its time has passed', () => {
    // Tuesday 8 pm for work due Thursday noon: "due Thursday" was for 4 pm that day.
    const steps = scheduleGuidanceSteps(new Date('2026-08-26T00:00:00.000Z'), due, TZ);

    expect(steps.map((s) => s.step)).toEqual(['t18h', 't12h', 't72h']);
  });

  describe('a reminder after the deadline whose time has passed', () => {
    // These two say the work is missing, and the ladder only says so once the portal does.
    // A sync that comes late is the first to see what the portal says, so the reminder is
    // queued to run now, while it is still the current one.
    it('is queued for now until the next one is due', () => {
      const now = hoursAfterDue(20);

      expect(scheduleGuidanceSteps(now, due, TZ)).toEqual([
        { step: 't12h', scheduledFor: now },
        { step: 't72h', scheduledFor: hoursAfterDue(72) },
      ]);
    });

    it('is queued for the minute it is due when the sync runs in that minute', () => {
      const now = hoursAfterDue(12);

      expect(scheduleGuidanceSteps(now, due, TZ)[0]).toEqual({ step: 't12h', scheduledFor: now });
    });

    it('gives way to the last one once that is due, which is queued for now for a day', () => {
      const now = hoursAfterDue(80);

      expect(scheduleGuidanceSteps(now, due, TZ)).toEqual([{ step: 't72h', scheduledFor: now }]);
    });

    it.each([96, 97, 24 * 30])('is not queued %i hours after the deadline', (hours) => {
      expect(scheduleGuidanceSteps(hoursAfterDue(hours), due, TZ)).toEqual([]);
    });
  });

  it('schedules remaining future windows including T-48h at 4pm local', () => {
    const now = new Date(due.getTime() - 80 * 60 * 60 * 1000);
    const steps = scheduleGuidanceSteps(now, due, TZ);
    expect(steps.map((s) => s.step)).toEqual(['t48h', 't18h', 't12h', 't72h']);
    const t48 = steps.find((s) => s.step === 't48h');
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        hourCycle: 'h23',
      })
        .formatToParts(t48!.scheduledFor)
        .find((p) => p.type === 'hour')?.value
    );
    expect(hour).toBe(16);
  });

  it('serializes a job payload for MongoQueue', () => {
    const payload = toGuidanceJobData(
      {
        studentId: 'emma-id',
        assignmentExternalId: 'demo-emma-ap-bio-a5',
        title: 'Cell Division',
        dueAt: due,
        timezone: TZ,
      },
      't48h'
    );
    expect(payload.step).toBe('t48h');
    expect(payload.dueAt).toBe(due.toISOString());
  });
});
