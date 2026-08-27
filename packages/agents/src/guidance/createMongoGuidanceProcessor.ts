import type { Db } from 'mongodb';
import { GuidanceJobHandler } from './GuidanceJobHandler';
import {
  loadQuietHoursForStudent,
  MongoAssignmentState,
  MongoGuidanceSendLog,
} from './mongoAdapters';
import { SystemGuidanceClock } from '@scholaracle/studio-core';
import type { INotificationSink } from '@scholaracle/interfaces';
import type { IJob } from '../queue/MongoQueue';

export function createMongoGuidanceProcessor(
  database: Db,
  sink: INotificationSink
): (job: IJob) => Promise<void> {
  const clock = new SystemGuidanceClock();
  const state = new MongoAssignmentState(database);
  const log = new MongoGuidanceSendLog(database, clock);
  return async (job: IJob): Promise<void> => {
    const studentId = job.data['studentId'];
    const quietHours =
      typeof studentId === 'string'
        ? await loadQuietHoursForStudent(database, studentId)
        : undefined;
    const handler = new GuidanceJobHandler({ clock, state, sink, log, quietHours });
    await handler.handle(job);
  };
}
