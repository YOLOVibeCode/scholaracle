import type { IGuidanceJobData, LadderStep } from '@scholaracle/interfaces';
import type { IJob } from '../queue/MongoQueue';
import {
  GuidanceLadder,
  LADDER_STEPS,
  type ILadderAssignment,
  type IQuietHoursConfig,
  type LadderOutcome,
} from '@scholaracle/studio-core';
import type {
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  INotificationSink,
} from '@scholaracle/interfaces';

export interface IGuidanceJobHandlerDeps {
  readonly clock: IGuidanceClock;
  readonly state: IAssignmentState;
  readonly sink: INotificationSink;
  readonly log: IGuidanceSendLog;
  readonly quietHours?: IQuietHoursConfig;
  /**
   * Queues the job again to run at `at`. A reminder that falls in quiet hours is held until
   * they end; without this it would be lost.
   */
  readonly runLater: (job: IJob, at: Date) => Promise<void>;
}

function isLadderStep(value: unknown): value is LadderStep {
  return LADDER_STEPS.some((step) => step === value);
}

function parseJobData(job: IJob): IGuidanceJobData {
  const data = job.data as unknown as IGuidanceJobData;
  if (
    typeof data.studentId !== 'string' ||
    typeof data.assignmentExternalId !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.dueAt !== 'string' ||
    typeof data.timezone !== 'string' ||
    !isLadderStep(data.step)
  ) {
    throw new Error('Guidance job missing assignment payload');
  }
  return data;
}

/**
 * Runs one queued reminder: the step the job names, for the assignment as it was when the
 * job was queued. The ladder reads the assignment again at send time.
 */
export class GuidanceJobHandler {
  private readonly _ladder: GuidanceLadder;
  private readonly _runLater: (job: IJob, at: Date) => Promise<void>;

  constructor(deps: IGuidanceJobHandlerDeps) {
    this._ladder = new GuidanceLadder(deps);
    this._runLater = deps.runLater;
  }

  public async handle(job: IJob): Promise<LadderOutcome> {
    const data = parseJobData(job);
    const assignment: ILadderAssignment = {
      studentId: data.studentId,
      assignmentExternalId: data.assignmentExternalId,
      title: data.title,
      dueAt: new Date(data.dueAt),
      timezone: data.timezone,
    };
    const outcome = await this._ladder.evaluate(assignment, data.step);
    if (outcome.kind === 'held') {
      await this._runLater(job, outcome.until);
    }
    return outcome;
  }
}
