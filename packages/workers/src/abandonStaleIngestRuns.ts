import type { Db } from 'mongodb';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function abandonStaleStartedRuns(database: Db, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ONE_HOUR_MS);
  await database
    .collection('slc_runs')
    .updateMany(
      { status: 'started', startedAt: { $lt: cutoff } },
      { $set: { status: 'abandoned', abandonedAt: now } }
    );
}
