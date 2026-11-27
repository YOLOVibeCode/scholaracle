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

  it('omits windows that have already passed', () => {
    const now = new Date(due.getTime() + 20 * 60 * 60 * 1000);
    const steps = scheduleGuidanceSteps(now, due, TZ);
    expect(steps.map((s) => s.step)).toEqual(['t72h']);
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
