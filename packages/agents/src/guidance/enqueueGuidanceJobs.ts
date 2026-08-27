import type { IGuidanceJobData } from '@scholaracle/interfaces';
import {
  scheduleGuidanceSteps,
  toGuidanceJobData,
  type ILadderAssignment,
} from '@scholaracle/studio-core';
import type { MongoQueue } from '../queue/MongoQueue';

export async function enqueueGuidanceJobs(
  queue: MongoQueue,
  assignment: ILadderAssignment,
  now: Date
): Promise<readonly string[]> {
  const steps = scheduleGuidanceSteps(now, assignment.dueAt, assignment.timezone);
  const ids: string[] = [];
  for (const step of steps) {
    const data: IGuidanceJobData = toGuidanceJobData(assignment, step.step);
    const id = await queue.add(
      'guidance',
      step.step,
      { ...data },
      { scheduledFor: step.scheduledFor }
    );
    ids.push(id);
  }
  return ids;
}
