import type { Db } from 'mongodb';
import { GuidanceJobHandler } from './GuidanceJobHandler';
import {
  loadQuietHoursForStudent,
  MongoAssignmentState,
  MongoGuidanceSendLog,
} from './mongoAdapters';
import { SystemGuidanceClock, type LadderOutcome } from '@scholaracle/studio-core';
import type { IGuidanceClock, INotificationSink } from '@scholaracle/interfaces';
import type { IJob, MongoQueue } from '../queue/MongoQueue';
import { logger } from '../logger';

/** Says in the workers' log what became of a reminder job. No names, no message text. */
function logOutcome(job: IJob, outcome: LadderOutcome): void {
  const fields = { job: 'guidance', jobId: job._id.toString(), step: job.name };
  if (outcome.kind === 'sent') {
    logger.info(fields, 'reminder sent');
  } else if (outcome.kind === 'held') {
    logger.info(
      { ...fields, until: outcome.until.toISOString() },
      'reminder held until quiet hours end'
    );
  } else {
    // Routine: most copies of a job find the reminder already sent or the work turned in.
    logger.debug({ ...fields, why: outcome.why }, 'reminder not sent');
  }
}

/**
 * What the workers run for each `guidance` job. `queue` is where a reminder held through
 * quiet hours is put back, to run when they end.
 */
export function createMongoGuidanceProcessor(
  database: Db,
  sink: INotificationSink,
  queue: Pick<MongoQueue, 'add'>,
  clock: IGuidanceClock = new SystemGuidanceClock()
): (job: IJob) => Promise<void> {
  const state = new MongoAssignmentState(database);
  const log = new MongoGuidanceSendLog(database, clock);
  const runLater = async (job: IJob, at: Date): Promise<void> => {
    await queue.add('guidance', job.name, job.data, { scheduledFor: at });
  };
  return async (job: IJob): Promise<void> => {
    const studentId = job.data['studentId'];
    const quietHours =
      typeof studentId === 'string'
        ? await loadQuietHoursForStudent(database, studentId)
        : undefined;
    const handler = new GuidanceJobHandler({ clock, state, sink, log, quietHours, runLater });
    logOutcome(job, await handler.handle(job));
  };
}
