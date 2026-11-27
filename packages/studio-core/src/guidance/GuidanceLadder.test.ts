import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssignmentLadderStatus,
  IAssignmentNow,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSend,
  IGuidanceSendLog,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
  LadderStep,
} from '@scholaracle/interfaces';
import { GuidanceLadder, type ILadderAssignment, type LadderOutcome } from './GuidanceLadder';
import { LADDER_STEPS, scheduleGuidanceSteps } from './scheduleGuidanceSteps';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STUDENT = 'emma-id';
const CELL = 'demo-emma-ap-bio-a5';
const TZ = 'America/Chicago';
/** Thursday 3 December 2026, 11:59 pm in Chicago: the usual deadline on a school portal. */
const DUE = new Date('2026-12-04T05:59:00.000Z');
/** When the scheduler runs each of the four reminders for DUE. */
const AT: Readonly<Record<LadderStep, Date>> = {
  t48h: new Date('2026-12-01T22:00:00.000Z'), // Tuesday 4 pm
  t18h: new Date('2026-12-03T22:00:00.000Z'), // Thursday 4 pm
  t12h: new Date('2026-12-04T17:59:00.000Z'), // Friday 11:59 am
  t72h: new Date('2026-12-07T05:59:00.000Z'), // Sunday 11:59 pm
};
/** The account default. */
const TEN_TO_SEVEN = { start: '22:00', end: '07:00' };

const ASSIGNMENT: ILadderAssignment = {
  studentId: STUDENT,
  assignmentExternalId: CELL,
  title: 'Cell Division',
  dueAt: DUE,
  timezone: TZ,
};

const SENT: LadderOutcome = { kind: 'sent' };

function skippedAs(why: string): LadderOutcome {
  return { kind: 'skipped', why } as LadderOutcome;
}

class FakeClock implements IGuidanceClock {
  public constructor(public nowDate: Date) {}
  public now(): Date {
    return this.nowDate;
  }
}

/** The assignment as the latest sync left it. Null: the portal no longer lists it. */
class FakeState implements IAssignmentState {
  public constructor(public now: IAssignmentNow | null) {}
  public async current(): Promise<IAssignmentNow | null> {
    return this.now;
  }
}

class FakeSink implements INotificationSink {
  public readonly sent: INotificationSinkMessage[] = [];
  /** People this household has no way to reach (a student with no login, say). */
  public readonly unreachable = new Set<'student' | 'parent'>();
  /** The next send to this audience fails once, as when the queue cannot be written. */
  public failNextFor: 'student' | 'parent' | null = null;

  public async send(input: INotificationSinkMessage): Promise<INotificationSinkResult> {
    if (this.failNextFor === input.audience) {
      this.failNextFor = null;
      throw new Error('the queue is down');
    }
    if (this.unreachable.has(input.audience)) return { deliveries: 0 };
    this.sent.push({ ...input });
    return { deliveries: 1 };
  }
}

function keyOf(send: IGuidanceSend): string {
  return [
    send.studentId,
    send.assignmentExternalId,
    send.dueAt.toISOString(),
    send.step,
    send.audience,
  ].join('|');
}

/** Hands a reminder to one caller, as the real log does: the check and the taking are one step. */
class FakeLog implements IGuidanceSendLog {
  /** Reminders taken and not given back. */
  public readonly taken = new Set<string>();
  public studentCount = 0;

  public async claim(send: IGuidanceSend): Promise<boolean> {
    if (this.taken.has(keyOf(send))) return false;
    this.taken.add(keyOf(send));
    return true;
  }
  public async release(send: IGuidanceSend): Promise<void> {
    this.taken.delete(keyOf(send));
  }
  public async claimStudentSendToday(_studentId: string, limit: number): Promise<boolean> {
    if (this.studentCount >= limit) return false;
    this.studentCount += 1;
    return true;
  }
  public async releaseStudentSendToday(): Promise<void> {
    this.studentCount -= 1;
  }
}

interface ILadderExtras {
  readonly status?: AssignmentLadderStatus;
  /** What the latest sync says. Default: still open, due when the job says. */
  readonly current?: IAssignmentNow | null;
  readonly log?: FakeLog;
  readonly sink?: FakeSink;
  readonly quietHours?: { start: string; end: string };
}

function ladder(
  now: Date,
  extras: ILadderExtras = {}
): { engine: GuidanceLadder; sink: FakeSink; log: FakeLog; clock: FakeClock } {
  const sink = extras.sink ?? new FakeSink();
  const log = extras.log ?? new FakeLog();
  const clock = new FakeClock(now);
  const current =
    extras.current !== undefined
      ? extras.current
      : { status: extras.status ?? 'missing', dueAt: DUE };
  const engine = new GuidanceLadder({
    clock,
    state: new FakeState(current),
    sink,
    log,
    quietHours: extras.quietHours,
  });
  return { engine, sink, log, clock };
}

describe('GuidanceLadder', () => {
  it('runs each reminder at the time the scheduler queues it for', () => {
    // AT is what the tests below set the clock to. It has to be the scheduler's own answer.
    const queued = scheduleGuidanceSteps(new Date(DUE.getTime() - 7 * DAY_MS), DUE, TZ);
    expect(queued).toEqual(LADDER_STEPS.map((step) => ({ step, scheduledFor: AT[step] })));
  });

  it('T-48h at 4pm local sends student only', async () => {
    const { engine, sink } = ladder(AT.t48h);

    expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);

    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('student');
    expect(sink.sent[0]?.body).toBe(
      'Cell Division is due Thursday. Open the worksheet when you have 15 min.'
    );
    expect(sink.sent[0]?.deepLink).toBe(`/studio/assignments/${CELL}`);
  });

  it('T-18h at 4pm local sends student only (firmer copy)', async () => {
    const { engine, sink } = ladder(AT.t18h);

    expect(await engine.evaluate(ASSIGNMENT, 't18h')).toEqual(SENT);

    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('student');
    expect(sink.sent[0]?.body.toLowerCase()).toMatch(/now|tonight|last-minute/);
    expect(sink.sent[0]?.deepLink).toBe(`/studio/assignments/${CELL}`);
  });

  it('after submit between T-48h and T-18h, T-18h send is skipped', async () => {
    // Closed: the portal has it submitted, graded or excused.
    const { engine, sink } = ladder(AT.t18h, { status: 'closed' });

    expect(await engine.evaluate(ASSIGNMENT, 't18h')).toEqual(skippedAs('closed'));
    expect(sink.sent).toEqual([]);
  });

  it('working_on_it is not submitted — T-18h still sends', async () => {
    const { engine, sink } = ladder(AT.t18h, { status: 'missing' });
    await engine.evaluate(ASSIGNMENT, 't18h');
    expect(sink.sent).toHaveLength(1);
  });

  it('sends when the portal gives no status at all', async () => {
    const { engine, sink } = ladder(AT.t18h, { status: 'open' });
    await engine.evaluate(ASSIGNMENT, 't18h');
    expect(sink.sent).toHaveLength(1);
  });

  it('T+12h still missing sends parent and student', async () => {
    const { engine, sink } = ladder(AT.t12h);

    expect(await engine.evaluate(ASSIGNMENT, 't12h')).toEqual(SENT);

    const audiences = sink.sent.map((s) => s.audience).sort();
    expect(audiences).toEqual(['parent', 'student']);
    const parent = sink.sent.find((s) => s.audience === 'parent');
    expect(parent?.deepLink).toMatch(/action-board/);
    expect(parent?.deepLink).toContain(STUDENT);
    const student = sink.sent.find((s) => s.audience === 'student');
    expect(student?.body).toMatch(/Still open/i);
  });

  it('names the assignment in every send, so a tap on the phone can open it', async () => {
    const { engine, sink } = ladder(AT.t12h);
    await engine.evaluate(ASSIGNMENT, 't12h');
    expect(sink.sent.map((s) => [s.audience, s.assignmentExternalId]).sort()).toEqual([
      ['parent', CELL],
      ['student', CELL],
    ]);
  });

  it('builds a link that still works when the assignment id has a space or a slash in it', async () => {
    const { engine, sink } = ladder(AT.t48h);
    await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'bio 101/lab #2' }, 't48h');
    expect(sink.sent[0]?.deepLink).toBe('/studio/assignments/bio%20101%2Flab%20%232');
    // The id itself goes on unchanged; only the link is encoded.
    expect(sink.sent[0]?.assignmentExternalId).toBe('bio 101/lab #2');
  });

  describe('when a reminder has nobody to go to', () => {
    it('is not recorded as sent and is not one of the two a day for the student', async () => {
      const sink = new FakeSink();
      sink.unreachable.add('student');
      const { engine, log } = ladder(AT.t48h, { sink });

      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('nobody_told'));

      expect(sink.sent).toEqual([]);
      expect(log.taken.size).toBe(0);
      expect(log.studentCount).toBe(0);
    });

    it('still tells the parent at T+12h and records that the parent was told', async () => {
      const sink = new FakeSink();
      sink.unreachable.add('student');
      const { engine, log } = ladder(AT.t12h, { sink });

      expect(await engine.evaluate(ASSIGNMENT, 't12h')).toEqual(SENT);

      expect(sink.sent.map((s) => s.audience)).toEqual(['parent']);
      expect([...log.taken]).toEqual([
        keyOf({
          studentId: STUDENT,
          assignmentExternalId: CELL,
          dueAt: DUE,
          step: 't12h',
          audience: 'parent',
        }),
      ]);
      expect(log.studentCount).toBe(0);
    });
  });

  describe('when many copies of one reminder run at the same moment', () => {
    // Every sync queues an assignment's coming reminders again, so by the time one is due
    // there are as many copies of its job as there were syncs, and the worker runs ten at once.
    it('sends it once', async () => {
      const { engine, sink } = ladder(AT.t48h);

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () => engine.evaluate(ASSIGNMENT, 't48h'))
      );

      expect(sink.sent).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.kind === 'sent')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.kind === 'skipped')).toHaveLength(9);
    });

    it('tells the student and the parent once each at T+12h', async () => {
      const { engine, sink } = ladder(AT.t12h);

      await Promise.all(Array.from({ length: 10 }, () => engine.evaluate(ASSIGNMENT, 't12h')));

      expect(sink.sent.map((s) => s.audience).sort()).toEqual(['parent', 'student']);
    });

    it('keeps to two a day for the student when three assignments come due together', async () => {
      const { engine, sink, log } = ladder(AT.t48h);

      await Promise.all(
        ['a-1', 'a-2', 'a-3'].map((assignmentExternalId) =>
          engine.evaluate({ ...ASSIGNMENT, assignmentExternalId }, 't48h')
        )
      );

      expect(sink.sent).toHaveLength(2);
      expect(log.studentCount).toBe(2);
      // The third was not sent, so it is not recorded as sent either.
      expect(log.taken.size).toBe(2);
    });
  });

  describe('when a send fails', () => {
    it('gives the reminder back, so the next try sends it', async () => {
      const sink = new FakeSink();
      sink.failNextFor = 'student';
      const { engine, log } = ladder(AT.t48h, { sink });

      await expect(engine.evaluate(ASSIGNMENT, 't48h')).rejects.toThrow('the queue is down');
      expect(log.taken.size).toBe(0);
      expect(log.studentCount).toBe(0);

      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
      expect(sink.sent.map((s) => s.audience)).toEqual(['student']);
      expect(log.studentCount).toBe(1);
    });

    it("tells the parent on the next try, and not the student again, when it was the parent's send that failed", async () => {
      const sink = new FakeSink();
      sink.failNextFor = 'parent';
      const { engine, log } = ladder(AT.t12h, { sink });

      await expect(engine.evaluate(ASSIGNMENT, 't12h')).rejects.toThrow('the queue is down');
      expect(await engine.evaluate(ASSIGNMENT, 't12h')).toEqual(SENT);

      expect(sink.sent.map((s) => s.audience)).toEqual(['student', 'parent']);
      expect(log.studentCount).toBe(1);
    });
  });

  it('T+12h does not send if already submitted', async () => {
    const { engine, sink } = ladder(AT.t12h, { status: 'closed' });
    await engine.evaluate(ASSIGNMENT, 't12h');
    expect(sink.sent).toEqual([]);
  });

  it('T+72h sends parent digest only', async () => {
    const { engine, sink } = ladder(AT.t72h);

    expect(await engine.evaluate(ASSIGNMENT, 't72h')).toEqual(SENT);

    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('parent');
    expect(sink.sent[0]?.body).not.toMatch(/\d+\s*%/);
  });

  it('caps student ladder pushes at 2 per day; a third is skipped', async () => {
    const log = new FakeLog();
    const sink = new FakeSink();
    const { engine } = ladder(AT.t48h, { log, sink });
    await engine.evaluate(ASSIGNMENT, 't48h');
    await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'other-1' }, 't48h');
    expect(
      await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'other-2' }, 't48h')
    ).toEqual(skippedAs('nobody_told'));
    expect(sink.sent.filter((s) => s.audience === 'student')).toHaveLength(2);
  });

  it('does not send the same step twice', async () => {
    const log = new FakeLog();
    const sink = new FakeSink();
    const { engine } = ladder(AT.t48h, { log, sink });
    await engine.evaluate(ASSIGNMENT, 't48h');
    expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('nobody_told'));
    expect(sink.sent).toHaveLength(1);
  });

  it.each(LADDER_STEPS)('says nothing about closed work at %s', async (step) => {
    const { engine, sink } = ladder(AT[step], { status: 'closed' });
    expect(await engine.evaluate(ASSIGNMENT, step)).toEqual(skippedAs('closed'));
    expect(sink.sent).toEqual([]);
  });

  describe('every reminder the scheduler queues is sent when its time comes', () => {
    // The scheduler and the ladder used to work the time out separately. The scheduler said
    // "4 pm on the day that is 48 hours before"; the ladder wanted the job to run 48 hours
    // before, give or take half an hour. For an 11:59 pm deadline that is eight hours apart,
    // so neither before-due reminder was ever sent.
    it.each([
      ['11:59 pm in Chicago', 'America/Chicago', '2026-12-04T05:59:00.000Z'],
      ['8 am, the start of class', 'America/Chicago', '2026-12-03T14:00:00.000Z'],
      ['noon', 'America/Chicago', '2026-12-03T18:00:00.000Z'],
      ['3 pm, the end of school', 'America/Chicago', '2026-12-03T21:00:00.000Z'],
      ['4 pm', 'America/Chicago', '2026-12-03T22:00:00.000Z'],
      ['6 pm', 'America/Chicago', '2026-12-04T00:00:00.000Z'],
      ['midnight', 'America/Chicago', '2026-12-04T06:00:00.000Z'],
      [
        '11:59 pm the day after the clocks go forward',
        'America/Chicago',
        '2027-03-16T04:59:00.000Z',
      ],
      ['11:59 pm the day after the clocks go back', 'America/Chicago', '2027-11-09T05:59:00.000Z'],
      ['11:59 pm in New York', 'America/New_York', '2026-12-04T04:59:00.000Z'],
      ['11:59 pm in Los Angeles', 'America/Los_Angeles', '2026-12-04T07:59:00.000Z'],
      [
        '11:59 pm in Kolkata, half an hour off the hour',
        'Asia/Kolkata',
        '2026-12-03T18:29:00.000Z',
      ],
    ])('for work due at %s', async (_label, timezone, dueIso) => {
      const dueAt = new Date(dueIso);
      const assignment = { ...ASSIGNMENT, dueAt, timezone };
      const queued = scheduleGuidanceSteps(new Date(dueAt.getTime() - 7 * DAY_MS), dueAt, timezone);
      expect(queued.map((job) => job.step)).toEqual(LADDER_STEPS);

      for (const job of queued) {
        const { engine } = ladder(job.scheduledFor, { current: { status: 'missing', dueAt } });
        expect([job.step, await engine.evaluate(assignment, job.step)]).toEqual([job.step, SENT]);
      }
    });

    it('with the default quiet hours too: each is sent on time or held until 7 am and sent then', async () => {
      for (const dueIso of [
        '2026-12-04T05:59:00.000Z', // 11:59 pm: three days after is 11:59 pm
        '2026-12-03T18:00:00.000Z', // noon: twelve hours after is midnight
        '2026-12-03T21:00:00.000Z', // 3 pm: twelve hours after is 3 am
        '2026-12-03T14:00:00.000Z', // 8 am
      ]) {
        const dueAt = new Date(dueIso);
        const assignment = { ...ASSIGNMENT, dueAt };
        const queued = scheduleGuidanceSteps(new Date(dueAt.getTime() - 7 * DAY_MS), dueAt, TZ);

        for (const job of queued) {
          const { engine, clock } = ladder(job.scheduledFor, {
            current: { status: 'missing', dueAt },
            quietHours: TEN_TO_SEVEN,
          });
          let outcome = await engine.evaluate(assignment, job.step);
          if (outcome.kind === 'held') {
            clock.nowDate = outcome.until;
            outcome = await engine.evaluate(assignment, job.step);
          }
          expect([dueIso, job.step, outcome]).toEqual([dueIso, job.step, SENT]);
        }
      }
    });
  });

  describe('a job that runs late', () => {
    // The workers restart on every deploy, and a held reminder runs when quiet hours end.
    it('still goes out an hour after its time', async () => {
      const { engine, sink } = ladder(new Date(AT.t48h.getTime() + HOUR_MS));
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
      expect(sink.sent).toHaveLength(1);
    });

    it('still goes out the next morning', async () => {
      const { engine } = ladder(new Date(AT.t48h.getTime() + 15 * HOUR_MS));
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
    });

    it('is dropped once the next reminder is due: the first does not follow the second', async () => {
      const { engine, sink } = ladder(AT.t18h);
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('too_late'));
      expect(sink.sent).toEqual([]);
    });

    it('does not say "due soon" once the work is due', async () => {
      const { engine: justBefore } = ladder(new Date(DUE.getTime() - 60_000));
      expect(await justBefore.evaluate(ASSIGNMENT, 't18h')).toEqual(SENT);

      const { engine: atTheDeadline, sink } = ladder(DUE);
      expect(await atTheDeadline.evaluate(ASSIGNMENT, 't18h')).toEqual(skippedAs('too_late'));
      expect(sink.sent).toEqual([]);
    });

    it('drops the twelve-hours-after reminder once the three-days-after one is due', async () => {
      const { engine: before } = ladder(new Date(AT.t72h.getTime() - 60_000));
      expect(await before.evaluate(ASSIGNMENT, 't12h')).toEqual(SENT);

      const { engine: after } = ladder(AT.t72h);
      expect(await after.evaluate(ASSIGNMENT, 't12h')).toEqual(skippedAs('too_late'));
    });

    it('drops the last reminder a day after its time', async () => {
      const { engine: before } = ladder(new Date(AT.t72h.getTime() + DAY_MS - 60_000));
      expect(await before.evaluate(ASSIGNMENT, 't72h')).toEqual(SENT);

      const { engine: after } = ladder(new Date(AT.t72h.getTime() + DAY_MS));
      expect(await after.evaluate(ASSIGNMENT, 't72h')).toEqual(skippedAs('too_late'));
    });
  });

  describe('a job that runs before its time', () => {
    it('is not sent', async () => {
      const { engine, sink } = ladder(new Date(AT.t48h.getTime() - HOUR_MS));
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('too_early'));
      expect(sink.sent).toEqual([]);
    });

    it('is sent when it is early by seconds, as two clocks can differ', async () => {
      const { engine } = ladder(new Date(AT.t48h.getTime() - 5_000));
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
    });
  });

  describe('quiet hours', () => {
    it('hold a reminder until they end instead of dropping it', async () => {
      // Three days after an 11:59 pm deadline is 11:59 pm on Sunday.
      const { engine, sink, log, clock } = ladder(AT.t72h, { quietHours: TEN_TO_SEVEN });
      const mondaySevenAm = new Date('2026-12-07T13:00:00.000Z');

      expect(await engine.evaluate(ASSIGNMENT, 't72h')).toEqual({
        kind: 'held',
        until: mondaySevenAm,
      });
      expect(sink.sent).toEqual([]);
      expect(log.taken.size).toBe(0);

      clock.nowDate = mondaySevenAm;
      expect(await engine.evaluate(ASSIGNMENT, 't72h')).toEqual(SENT);
      expect(sink.sent.map((s) => s.audience)).toEqual(['parent']);
    });

    it('hold the student and the parent alike at T+12h', async () => {
      // Twelve hours after a 3 pm deadline is 3 am.
      const dueAt = new Date('2026-12-03T21:00:00.000Z');
      const { engine, sink } = ladder(new Date('2026-12-04T09:00:00.000Z'), {
        current: { status: 'missing', dueAt },
        quietHours: TEN_TO_SEVEN,
      });

      expect(await engine.evaluate({ ...ASSIGNMENT, dueAt }, 't12h')).toEqual({
        kind: 'held',
        until: new Date('2026-12-04T13:00:00.000Z'),
      });
      expect(sink.sent).toEqual([]);
    });

    it('do not hold a reminder that falls outside them', async () => {
      const { engine } = ladder(AT.t48h, { quietHours: TEN_TO_SEVEN });
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
    });

    it('drop a reminder that would be out of date by the time they end', async () => {
      // Due at 6 pm, so the last reminder is at 4 pm, in a household that is quiet 3 to 7 pm.
      const dueAt = new Date('2026-12-04T00:00:00.000Z');
      const { engine, sink } = ladder(new Date('2026-12-03T22:00:00.000Z'), {
        current: { status: 'missing', dueAt },
        quietHours: { start: '15:00', end: '19:00' },
      });

      expect(await engine.evaluate({ ...ASSIGNMENT, dueAt }, 't18h')).toEqual(
        skippedAs('too_late')
      );
      expect(sink.sent).toEqual([]);
    });

    it('drop a reminder when they end at the very moment it goes out of date', async () => {
      // Due at 6 pm in a household that is quiet from 3 pm to 6 pm: at 6 pm "due soon" is late.
      const dueAt = new Date('2026-12-04T00:00:00.000Z');
      const { engine } = ladder(new Date('2026-12-03T22:00:00.000Z'), {
        current: { status: 'missing', dueAt },
        quietHours: { start: '15:00', end: '18:00' },
      });

      expect(await engine.evaluate({ ...ASSIGNMENT, dueAt }, 't18h')).toEqual(
        skippedAs('too_late')
      );
    });

    it('hold a reminder when they end a minute before it goes out of date', async () => {
      const dueAt = new Date('2026-12-04T00:00:00.000Z');
      const { engine } = ladder(new Date('2026-12-03T22:00:00.000Z'), {
        current: { status: 'missing', dueAt },
        quietHours: { start: '15:00', end: '17:59' },
      });

      expect(await engine.evaluate({ ...ASSIGNMENT, dueAt }, 't18h')).toEqual({
        kind: 'held',
        until: new Date('2026-12-03T23:59:00.000Z'),
      });
    });

    it('are checked after the work itself: turned-in work is not held, it is done', async () => {
      const { engine } = ladder(AT.t72h, { status: 'closed', quietHours: TEN_TO_SEVEN });
      expect(await engine.evaluate(ASSIGNMENT, 't72h')).toEqual(skippedAs('closed'));
    });
  });

  describe('work that changed after the job was queued', () => {
    it('is left alone when it is due at another time now', async () => {
      // The teacher gave everyone until Monday. The sync that saw the change queued new jobs.
      const monday = new Date('2026-12-08T05:59:00.000Z');
      const { engine, sink } = ladder(AT.t12h, { current: { status: 'missing', dueAt: monday } });

      expect(await engine.evaluate(ASSIGNMENT, 't12h')).toEqual(skippedAs('rescheduled'));
      expect(sink.sent).toEqual([]);
    });

    it('is left alone when it no longer has a due time', async () => {
      const { engine, sink } = ladder(AT.t48h, { current: { status: 'missing', dueAt: null } });
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('rescheduled'));
      expect(sink.sent).toEqual([]);
    });

    it('is left alone when the portal no longer lists it', async () => {
      const { engine, sink } = ladder(AT.t12h, { current: null });
      expect(await engine.evaluate(ASSIGNMENT, 't12h')).toEqual(skippedAs('removed'));
      expect(sink.sent).toEqual([]);
    });

    it('takes any other due time as a deadline that moved, a minute later included', async () => {
      // The job and the row are made from the same portal record. A sync that reads another
      // time, however close, queues its own jobs for it; two sets must not both speak.
      for (const minutes of [1, -1]) {
        const { engine, sink } = ladder(AT.t48h, {
          current: { status: 'missing', dueAt: new Date(DUE.getTime() + minutes * 60_000) },
        });
        expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(skippedAs('rescheduled'));
        expect(sink.sent).toEqual([]);
      }
    });

    it('goes ahead when the due time is the same instant, however the date was made', async () => {
      const { engine } = ladder(AT.t48h, {
        current: { status: 'missing', dueAt: new Date('2026-12-03T23:59:00-06:00') },
      });
      expect(await engine.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);
    });

    it('reminds again for the new deadline when the same reminder went out for the old one', async () => {
      // "Due Thursday" went out on Tuesday. Then the teacher gave everyone until Monday.
      const log = new FakeLog();
      const sink = new FakeSink();
      const { engine: tuesday } = ladder(AT.t48h, { log, sink });
      expect(await tuesday.evaluate(ASSIGNMENT, 't48h')).toEqual(SENT);

      const monday = new Date('2026-12-08T05:59:00.000Z');
      const saturdayFourPm = new Date('2026-12-05T22:00:00.000Z');
      const { engine: saturday } = ladder(saturdayFourPm, {
        log,
        sink,
        current: { status: 'missing', dueAt: monday },
      });
      const moved = { ...ASSIGNMENT, dueAt: monday };

      expect(await saturday.evaluate(moved, 't48h')).toEqual(SENT);
      // And once only for the new deadline too.
      expect(await saturday.evaluate(moved, 't48h')).toEqual(skippedAs('nobody_told'));
      expect(sink.sent.map((message) => message.body)).toEqual([
        'Cell Division is due Thursday. Open the worksheet when you have 15 min.',
        'Cell Division is due Monday. Open the worksheet when you have 15 min.',
      ]);
    });
  });
});

describe('ISP — GuidanceLadder stays host-agnostic', () => {
  it('does not import Express, React, Next, or INudgePublisher', () => {
    const src = readFileSync(join(__dirname, 'GuidanceLadder.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]express['"]/);
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/from ['"]next/);
    expect(src).not.toMatch(/INudgePublisher/);
    expect(src).not.toMatch(/IStudentProvisioner/);
    expect(src).not.toMatch(/IStudentMagicLink/);
  });
});
