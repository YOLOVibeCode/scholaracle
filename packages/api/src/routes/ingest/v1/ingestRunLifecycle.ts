import type { IngestRun } from '@scholaracle/database';
import { AuthenticationError, ConflictError } from '@scholaracle/contracts';
import type { IngestRunStatus } from '@scholaracle/database';

export function assertIngestRunActor(run: IngestRun, actorUserId: string): void {
  const runActorUserId = run.actorUserId?.toString() ?? run.userId.toString();
  const runDataUserId = run.userId.toString();
  if (runActorUserId !== actorUserId && runDataUserId !== actorUserId) {
    throw new AuthenticationError('Not authorized to access this run');
  }
}

export function assertRunStatus(run: IngestRun, allowed: readonly IngestRunStatus[]): void {
  if (!allowed.includes(run.status)) {
    throw new ConflictError(`Run is not in a valid state for this request (status: ${run.status})`);
  }
}
