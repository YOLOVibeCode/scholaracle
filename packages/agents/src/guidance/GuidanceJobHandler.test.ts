import type { ObjectId } from 'mongodb';
import { GuidanceJobHandler } from './GuidanceJobHandler';
import type { IJob } from '../queue/MongoQueue';
import type {
  AssignmentLadderStatus,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  INotificationSink,
  LadderStep,
} from '@scholaracle/interfaces';

const DUE = new Date('2026-08-27T16:00:00.000Z');

class FakeClock implements IGuidanceClock {
  public constructor(
    public nowDate: Date,
    public hour: number
  ) {}
  public now(): Date {
    return this.nowDate;
  }
  public localHour(): number {
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
  public readonly sent: Array<{ audience: 'student' | 'parent' }> = [];
  public async send(input: {
    readonly audience: 'student' | 'parent';
    readonly studentId: string;
    readonly body: string;
    readonly deepLink: string;
  }): Promise<void> {
    this.sent.push({ audience: input.audience });
  }
}

class FakeLog implements IGuidanceSendLog {
  public async alreadySent(): Promise<boolean> {
    return false;
  }
  public async markSent(): Promise<void> {
    return;
  }
  public async studentLadderSendsToday(): Promise<number> {
    return 0;
  }
  public async recordStudentLadderSend(): Promise<void> {
    return;
  }
}

function job(overrides?: Partial<IJob['data']>): IJob {
  return {
    _id: { toString: () => 'job-1' } as ObjectId,
    type: 'guidance',
    name: 't18h',
    data: {
      studentId: 'emma-id',
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      title: 'Cell Division',
      dueAt: DUE.toISOString(),
      timezone: 'America/New_York',
      step: 't18h' as LadderStep,
      ...overrides,
    },
    scheduledFor: new Date(),
    priority: 10,
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('GuidanceJobHandler', () => {
  it('re-checks LMS status at send time and skips T-18h when submitted', async () => {
    const sink = new FakeSink();
    const handler = new GuidanceJobHandler({
      clock: new FakeClock(new Date(DUE.getTime() - 18 * 60 * 60 * 1000), 16),
      state: new FakeState('submitted'),
      sink,
      log: new FakeLog(),
    });
    await handler.handle(job());
    expect(sink.sent).toEqual([]);
  });

  it('sends student-only at T-48h when still missing', async () => {
    const sink = new FakeSink();
    const handler = new GuidanceJobHandler({
      clock: new FakeClock(new Date(DUE.getTime() - 48 * 60 * 60 * 1000), 16),
      state: new FakeState('missing'),
      sink,
      log: new FakeLog(),
    });
    await handler.handle(job({ step: 't48h' }));
    expect(sink.sent).toEqual([{ audience: 'student' }]);
  });

  it('throws when the payload is incomplete', async () => {
    const handler = new GuidanceJobHandler({
      clock: new FakeClock(new Date(), 16),
      state: new FakeState('missing'),
      sink: new FakeSink(),
      log: new FakeLog(),
    });
    await expect(handler.handle(job({ studentId: undefined }))).rejects.toThrow(
      'Guidance job missing assignment payload'
    );
  });
});
