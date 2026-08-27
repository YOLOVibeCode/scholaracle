import { scheduleGuidanceSteps, toGuidanceJobData } from './scheduleGuidanceSteps';

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
