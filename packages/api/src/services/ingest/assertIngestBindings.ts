import type { Db } from 'mongodb';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { SlcBindingRepository } from '@scholaracle/database';
import { IngestMissingBindingError } from './IngestMissingBindingError';

function uniqueSourceStudentPairs(
  ops: readonly ISlcDeltaOp[],
  sourceId: string
): Array<{ sourceId: string; studentExternalId: string }> {
  const keys = new Set<string>();
  const pairs: Array<{ sourceId: string; studentExternalId: string }> = [];
  for (const op of ops) {
    const studentExternalId = op.key?.studentExternalId;
    if (typeof studentExternalId !== 'string' || !studentExternalId.trim()) continue;
    const key = `${sourceId}\0${studentExternalId}`;
    if (keys.has(key)) continue;
    keys.add(key);
    pairs.push({ sourceId, studentExternalId });
  }
  return pairs;
}

export async function assertIngestBindingsForOps(params: {
  readonly database: Db;
  readonly userId: string;
  readonly sourceId: string;
  readonly ops: readonly ISlcDeltaOp[];
}): Promise<void> {
  if (!params.sourceId) {
    throw new IngestMissingBindingError('Missing sourceId on ingest envelope');
  }
  const pairs = uniqueSourceStudentPairs(params.ops, params.sourceId);
  if (pairs.length === 0) {
    return;
  }
  const repo = new SlcBindingRepository(params.database);
  for (const pair of pairs) {
    const ok = await repo.hasBindingForSourceStudent(
      params.userId,
      pair.sourceId,
      pair.studentExternalId
    );
    if (!ok) {
      throw new IngestMissingBindingError(
        `No binding for source ${pair.sourceId} and student ${pair.studentExternalId}`
      );
    }
  }
}
