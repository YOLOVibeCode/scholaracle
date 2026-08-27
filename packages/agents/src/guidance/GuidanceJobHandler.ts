import type { IGuidanceJobData } from '@scholaracle/interfaces';
import type { IJob } from '../queue/MongoQueue';
import { GuidanceLadder, type ILadderAssignment } from '@scholaracle/studio-core';
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
  readonly quietHours?: { readonly start: string; readonly end: string };
}

function parseJobData(job: IJob): IGuidanceJobData {
  const data = job.data as unknown as IGuidanceJobData;
  if (
    typeof data.studentId !== 'string' ||
    typeof data.assignmentExternalId !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.dueAt !== 'string' ||
    typeof data.timezone !== 'string'
  ) {
    throw new Error('Guidance job missing assignment payload');
  }
  return data;
}

/**
 * Re-checks LMS status at send time, then runs GuidanceLadder.evaluate.
 */
export class GuidanceJobHandler {
  private readonly _ladder: GuidanceLadder;

  constructor(deps: IGuidanceJobHandlerDeps) {
    this._ladder = new GuidanceLadder(deps);
  }

  public async handle(job: IJob): Promise<void> {
    const data = parseJobData(job);
    const assignment: ILadderAssignment = {
      studentId: data.studentId,
      assignmentExternalId: data.assignmentExternalId,
      title: data.title,
      dueAt: new Date(data.dueAt),
      timezone: data.timezone,
    };
    await this._ladder.evaluate(assignment);
  }
}
