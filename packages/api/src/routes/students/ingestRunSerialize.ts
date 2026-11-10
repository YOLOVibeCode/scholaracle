import type { IRunListItem } from '@scholaracle/contracts';
import type { IngestRun } from '@scholaracle/database';

export function serializeIngestRunListItem(run: IngestRun): IRunListItem {
  return {
    runId: run.runId,
    sourceId: run.sourceId,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    uploadedAt: run.uploadedAt?.toISOString(),
    committedAt: run.committedAt?.toISOString(),
    abandonedAt: run.abandonedAt?.toISOString(),
    error: run.error ?? null,
    coverage: run.coverage ?? undefined,
    warnings: run.warnings ?? undefined,
    steps: run.steps ?? undefined,
    stats: run.stats ?? undefined,
    lastCursor: run.lastCursor ?? undefined,
    newCursor: run.newCursor ?? undefined,
    clientMeta: run.clientMeta ?? undefined,
  };
}
