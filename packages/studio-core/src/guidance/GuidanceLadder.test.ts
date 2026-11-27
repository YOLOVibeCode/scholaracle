import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssignmentLadderStatus,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSend,
  IGuidanceSendLog,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
} from '@scholaracle/interfaces';
import { GuidanceLadder, isQuietHour, type ILadderAssignment } from './GuidanceLadder';

const STUDENT = 'emma-id';
const CELL = 'demo-emma-ap-bio-a5';
const DUE = new Date('2026-08-27T16:00:00.000Z');
const TZ = 'America/New_York';

const ASSIGNMENT: ILadderAssignment = {
  studentId: STUDENT,
  assignmentExternalId: CELL,
  title: 'Cell Division',
  dueAt: DUE,
  timezone: TZ,
};

class FakeClock implements IGuidanceClock {
  public constructor(
    public nowDate: Date,
    public hour: number
  ) {}
  public now(): Date {
    return this.nowDate;
  }
  public localHour(_timezone: string): number {
    return this.hour;
  }
}

class FakeState implements IAssignmentState {
  public constructor(public current: AssignmentLadderStatus) {}
  public async status(): Promise<AssignmentLadderStatus> {
    return this.current;
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
  return `${send.studentId}:${send.assignmentExternalId}:${send.step}:${send.audience}`;
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

function ladder(
  now: Date,
  hour: number,
  status: AssignmentLadderStatus = 'missing',
  extras?: { log?: FakeLog; sink?: FakeSink; quietHours?: { start: string; end: string } }
): { engine: GuidanceLadder; sink: FakeSink; log: FakeLog } {
  const sink = extras?.sink ?? new FakeSink();
  const log = extras?.log ?? new FakeLog();
  const engine = new GuidanceLadder({
    clock: new FakeClock(now, hour),
    state: new FakeState(status),
    sink,
    log,
    quietHours: extras?.quietHours,
  });
  return { engine, sink, log };
}

describe('GuidanceLadder', () => {
  it('T-48h at 4pm local sends student only', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('student');
    expect(sink.sent[0]?.body).toMatch(/Cell Division/);
    expect(sink.sent[0]?.body).toMatch(/15 min/i);
    expect(sink.sent[0]?.deepLink).toBe(`/studio/assignments/${CELL}`);
  });

  it('T-18h at 4pm local sends student only (firmer copy)', async () => {
    const now = new Date(DUE.getTime() - 18 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('student');
    expect(sink.sent[0]?.body.toLowerCase()).toMatch(/now|tonight|last-minute/);
    expect(sink.sent[0]?.deepLink).toBe(`/studio/assignments/${CELL}`);
  });

  it('after submit between T-48h and T-18h, T-18h send is skipped', async () => {
    const now = new Date(DUE.getTime() - 18 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16, 'submitted');
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });

  it('working_on_it is not submitted — T-18h still sends', async () => {
    const now = new Date(DUE.getTime() - 18 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16, 'missing');
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toHaveLength(1);
  });

  it('T+12h still missing sends parent and student', async () => {
    const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 14);
    await engine.evaluate(ASSIGNMENT);
    const audiences = sink.sent.map((s) => s.audience).sort();
    expect(audiences).toEqual(['parent', 'student']);
    const parent = sink.sent.find((s) => s.audience === 'parent');
    expect(parent?.deepLink).toMatch(/action-board/);
    expect(parent?.deepLink).toContain(STUDENT);
    const student = sink.sent.find((s) => s.audience === 'student');
    expect(student?.body).toMatch(/Still open/i);
  });

  it('names the assignment in every send, so a tap on the phone can open it', async () => {
    const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 14);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent.map((s) => [s.audience, s.assignmentExternalId]).sort()).toEqual([
      ['parent', CELL],
      ['student', CELL],
    ]);
  });

  it('builds a link that still works when the assignment id has a space or a slash in it', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16);
    await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'bio 101/lab #2' });
    expect(sink.sent[0]?.deepLink).toBe('/studio/assignments/bio%20101%2Flab%20%232');
    // The id itself goes on unchanged; only the link is encoded.
    expect(sink.sent[0]?.assignmentExternalId).toBe('bio 101/lab #2');
  });

  describe('when a reminder has nobody to go to', () => {
    it('is not recorded as sent and is not one of the two a day for the student', async () => {
      const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
      const sink = new FakeSink();
      sink.unreachable.add('student');
      const { engine, log } = ladder(now, 16, 'missing', { sink });

      await engine.evaluate(ASSIGNMENT);

      expect(sink.sent).toEqual([]);
      expect(log.taken.size).toBe(0);
      expect(log.studentCount).toBe(0);
    });

    it('still tells the parent at T+12h and records that the parent was told', async () => {
      const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
      const sink = new FakeSink();
      sink.unreachable.add('student');
      const { engine, log } = ladder(now, 14, 'missing', { sink });

      await engine.evaluate(ASSIGNMENT);

      expect(sink.sent.map((s) => s.audience)).toEqual(['parent']);
      expect([...log.taken]).toEqual([`${STUDENT}:${CELL}:t12h:parent`]);
      expect(log.studentCount).toBe(0);
    });
  });

  describe('when many copies of one reminder run at the same moment', () => {
    // Every sync queues an assignment's coming reminders again, so by the time one is due
    // there are as many copies of its job as there were syncs, and the worker runs ten at once.
    it('sends it once', async () => {
      const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
      const { engine, sink } = ladder(now, 16);

      await Promise.all(Array.from({ length: 10 }, () => engine.evaluate(ASSIGNMENT)));

      expect(sink.sent).toHaveLength(1);
    });

    it('tells the student and the parent once each at T+12h', async () => {
      const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
      const { engine, sink } = ladder(now, 14);

      await Promise.all(Array.from({ length: 10 }, () => engine.evaluate(ASSIGNMENT)));

      expect(sink.sent.map((s) => s.audience).sort()).toEqual(['parent', 'student']);
    });

    it('keeps to two a day for the student when three assignments come due together', async () => {
      const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
      const { engine, sink, log } = ladder(now, 16);

      await Promise.all(
        ['a-1', 'a-2', 'a-3'].map((assignmentExternalId) =>
          engine.evaluate({ ...ASSIGNMENT, assignmentExternalId })
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
      const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
      const sink = new FakeSink();
      sink.failNextFor = 'student';
      const { engine, log } = ladder(now, 16, 'missing', { sink });

      await expect(engine.evaluate(ASSIGNMENT)).rejects.toThrow('the queue is down');
      expect(log.taken.size).toBe(0);
      expect(log.studentCount).toBe(0);

      await engine.evaluate(ASSIGNMENT);
      expect(sink.sent.map((s) => s.audience)).toEqual(['student']);
      expect(log.studentCount).toBe(1);
    });

    it("tells the parent on the next try, and not the student again, when it was the parent's send that failed", async () => {
      const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
      const sink = new FakeSink();
      sink.failNextFor = 'parent';
      const { engine, log } = ladder(now, 14, 'missing', { sink });

      await expect(engine.evaluate(ASSIGNMENT)).rejects.toThrow('the queue is down');
      await engine.evaluate(ASSIGNMENT);

      expect(sink.sent.map((s) => s.audience)).toEqual(['student', 'parent']);
      expect(log.studentCount).toBe(1);
    });
  });

  it('T+12h does not send if already submitted', async () => {
    const now = new Date(DUE.getTime() + 12 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 14, 'submitted');
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });

  it('T+72h sends parent digest only', async () => {
    const now = new Date(DUE.getTime() + 72 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 10);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0]?.audience).toBe('parent');
    expect(sink.sent[0]?.body).not.toMatch(/\d+\s*%/);
  });

  it('quiet hours skip the send', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 23, 'missing', {
      quietHours: { start: '22:00', end: '07:00' },
    });
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });

  it('caps student ladder pushes at 2 per day; a third is skipped', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const log = new FakeLog();
    const sink = new FakeSink();
    const { engine } = ladder(now, 16, 'missing', { log, sink });
    await engine.evaluate(ASSIGNMENT);
    await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'other-1', title: 'Other 1' });
    await engine.evaluate({ ...ASSIGNMENT, assignmentExternalId: 'other-2', title: 'Other 2' });
    expect(sink.sent.filter((s) => s.audience === 'student')).toHaveLength(2);
  });

  it('does not send T-48h unless local hour is 16', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 10);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });

  it('does nothing outside a ladder window', async () => {
    const now = new Date(DUE.getTime() - 30 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });

  it('does not send the same step twice', async () => {
    const now = new Date(DUE.getTime() - 48 * 60 * 60 * 1000);
    const log = new FakeLog();
    const sink = new FakeSink();
    const { engine } = ladder(now, 16, 'missing', { log, sink });
    await engine.evaluate(ASSIGNMENT);
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toHaveLength(1);
  });

  it('skips graded the same as submitted', async () => {
    const now = new Date(DUE.getTime() - 18 * 60 * 60 * 1000);
    const { engine, sink } = ladder(now, 16, 'graded');
    await engine.evaluate(ASSIGNMENT);
    expect(sink.sent).toEqual([]);
  });
});

describe('isQuietHour', () => {
  it('treats overnight 22:00–07:00 as quiet at 23 and 6, not at 16', () => {
    const q = { start: '22:00', end: '07:00' };
    expect(isQuietHour(23, q)).toBe(true);
    expect(isQuietHour(6, q)).toBe(true);
    expect(isQuietHour(16, q)).toBe(false);
  });

  it('treats a same-day window as quiet only inside it', () => {
    const q = { start: '12:00', end: '13:00' };
    expect(isQuietHour(12, q)).toBe(true);
    expect(isQuietHour(13, q)).toBe(false);
  });

  it('is never quiet when start equals end or config is missing', () => {
    expect(isQuietHour(3, { start: '00:00', end: '00:00' })).toBe(false);
    expect(isQuietHour(3)).toBe(false);
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
