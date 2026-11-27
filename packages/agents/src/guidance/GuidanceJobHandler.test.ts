import type { ObjectId } from 'mongodb';
import { GuidanceJobHandler } from './GuidanceJobHandler';
import type { IJob } from '../queue/MongoQueue';
import type {
  AssignmentLadderStatus,
  IAssignmentNow,
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  INotificationSink,
  INotificationSinkMessage,
  INotificationSinkResult,
  LadderStep,
} from '@scholaracle/interfaces';

/** Thursday 3 December 2026, 11:59 pm in Chicago. */
const DUE = new Date('2026-12-04T05:59:00.000Z');
const TUESDAY_4PM = new Date('2026-12-01T22:00:00.000Z');
const THURSDAY_4PM = new Date('2026-12-03T22:00:00.000Z');
const SUNDAY_1159PM = new Date('2026-12-07T05:59:00.000Z');

class FakeClock implements IGuidanceClock {
  public constructor(public nowDate: Date) {}
  public now(): Date {
    return this.nowDate;
  }
}

class FakeState implements IAssignmentState {
  public constructor(public status: AssignmentLadderStatus) {}
  public async current(): Promise<IAssignmentNow | null> {
    return { status: this.status, dueAt: DUE };
  }
}

class FakeSink implements INotificationSink {
  public readonly sent: Array<{ audience: 'student' | 'parent'; body: string }> = [];
  public async send(input: INotificationSinkMessage): Promise<INotificationSinkResult> {
    this.sent.push({ audience: input.audience, body: input.body });
    return { deliveries: 1 };
  }
}

/** Nothing has gone out yet and the student has had none today. */
class FakeLog implements IGuidanceSendLog {
  public async claim(): Promise<boolean> {
    return true;
  }
  public async release(): Promise<void> {
    return;
  }
  public async claimStudentSendToday(): Promise<boolean> {
    return true;
  }
  public async releaseStudentSendToday(): Promise<void> {
    return;
  }
}

function job(step: LadderStep | undefined, overrides?: Partial<IJob['data']>): IJob {
  return {
    _id: { toString: () => 'job-1' } as ObjectId,
    type: 'guidance',
    name: step ?? 'unnamed',
    data: {
      studentId: 'emma-id',
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      title: 'Cell Division',
      dueAt: DUE.toISOString(),
      timezone: 'America/Chicago',
      step,
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

function handlerAt(
  now: Date,
  options: {
    status?: AssignmentLadderStatus;
    quietHours?: { start: string; end: string };
  } = {}
): {
  handler: GuidanceJobHandler;
  sink: FakeSink;
  runLater: jest.Mock<Promise<void>, [IJob, Date]>;
} {
  const sink = new FakeSink();
  const runLater = jest.fn<Promise<void>, [IJob, Date]>().mockResolvedValue(undefined);
  const handler = new GuidanceJobHandler({
    clock: new FakeClock(now),
    state: new FakeState(options.status ?? 'missing'),
    sink,
    log: new FakeLog(),
    quietHours: options.quietHours,
    runLater,
  });
  return { handler, sink, runLater };
}

describe('GuidanceJobHandler', () => {
  it('re-checks LMS status at send time and skips T-18h when submitted', async () => {
    const { handler, sink } = handlerAt(THURSDAY_4PM, { status: 'closed' });

    expect(await handler.handle(job('t18h'))).toEqual({ kind: 'skipped', why: 'closed' });
    expect(sink.sent).toEqual([]);
  });

  it('sends student-only at T-48h when still missing', async () => {
    const { handler, sink, runLater } = handlerAt(TUESDAY_4PM);

    expect(await handler.handle(job('t48h'))).toEqual({ kind: 'sent' });
    expect(sink.sent.map((message) => message.audience)).toEqual(['student']);
    expect(runLater).not.toHaveBeenCalled();
  });

  it('sends the reminder the job names, not one worked out from the clock', async () => {
    // Thursday 4 pm is the time of the second reminder. A late copy of the first job that
    // runs then is out of date; it must not go out as the second.
    const { handler, sink } = handlerAt(THURSDAY_4PM);

    expect(await handler.handle(job('t48h'))).toEqual({ kind: 'skipped', why: 'too_late' });
    expect(sink.sent).toEqual([]);

    expect(await handler.handle(job('t18h'))).toEqual({ kind: 'sent' });
    expect(sink.sent.map((message) => message.body)).toEqual([
      "Cell Division is due soon. Open it now so it isn't last-minute.",
    ]);
  });

  it('queues the job again for when quiet hours end, and sends nothing meanwhile', async () => {
    const { handler, sink, runLater } = handlerAt(SUNDAY_1159PM, {
      quietHours: { start: '22:00', end: '07:00' },
    });
    const held = job('t72h');

    expect(await handler.handle(held)).toEqual({
      kind: 'held',
      until: new Date('2026-12-07T13:00:00.000Z'),
    });

    expect(sink.sent).toEqual([]);
    expect(runLater).toHaveBeenCalledTimes(1);
    expect(runLater).toHaveBeenCalledWith(held, new Date('2026-12-07T13:00:00.000Z'));
  });

  it('fails the job when it cannot be queued again, so the queue retries it', async () => {
    const { handler, runLater } = handlerAt(SUNDAY_1159PM, {
      quietHours: { start: '22:00', end: '07:00' },
    });
    runLater.mockRejectedValueOnce(new Error('the queue is down'));

    await expect(handler.handle(job('t72h'))).rejects.toThrow('the queue is down');
  });

  it('throws when the payload is incomplete', async () => {
    const { handler } = handlerAt(TUESDAY_4PM);
    await expect(handler.handle(job('t48h', { studentId: undefined }))).rejects.toThrow(
      'Guidance job missing assignment payload'
    );
  });

  it.each([[undefined], ['t24h'], [48]])(
    'throws when the job does not name one of the four reminders: %p',
    async (step) => {
      const { handler, sink } = handlerAt(TUESDAY_4PM);
      await expect(handler.handle(job('t48h', { step }))).rejects.toThrow(
        'Guidance job missing assignment payload'
      );
      expect(sink.sent).toEqual([]);
    }
  );
});
