import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssignmentLadderStatus,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  INotificationSink,
  LadderStep,
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
  public readonly sent: Array<{
    audience: 'student' | 'parent';
    studentId: string;
    body: string;
    deepLink: string;
  }> = [];
  public async send(input: {
    readonly audience: 'student' | 'parent';
    readonly studentId: string;
    readonly body: string;
    readonly deepLink: string;
  }): Promise<void> {
    this.sent.push({ ...input });
  }
}

class FakeLog implements IGuidanceSendLog {
  public readonly sentSteps = new Set<string>();
  public studentCount = 0;
  public async alreadySent(
    studentId: string,
    assignmentExternalId: string,
    step: LadderStep
  ): Promise<boolean> {
    return this.sentSteps.has(`${studentId}:${assignmentExternalId}:${step}`);
  }
  public async markSent(
    studentId: string,
    assignmentExternalId: string,
    step: LadderStep
  ): Promise<void> {
    this.sentSteps.add(`${studentId}:${assignmentExternalId}:${step}`);
  }
  public async studentLadderSendsToday(): Promise<number> {
    return this.studentCount;
  }
  public async recordStudentLadderSend(): Promise<void> {
    this.studentCount += 1;
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
