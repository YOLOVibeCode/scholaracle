/**
 * Wire contracts for GET /api/students/:id/sources and
 * GET /api/students/:id/sources/:sourceId/runs.
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts.
 * Note: a data source only appears in the list if a matching IngestSource
 * record exists (created via POST /api/ingest/v1/sources).
 */

import type {
  ISlcIngestRunStats,
  ISlcIngestRunStep,
  ISlcRunCoverage,
  ISourceIngestLastCounts,
  ISlcCursor,
} from '../../models/Ingest';

export interface ISourceListItem {
  readonly id: string;
  readonly pluginId: string;
  readonly provider: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly enabled: boolean;
  readonly schedule: string;
  readonly dataTypes: readonly string[];
  readonly status: string;
  readonly hasCredentials?: boolean;
  readonly lastScraped?: string;
  readonly lastSuccess?: string;
  readonly lastSuccessAt?: string;
  readonly lastRunId?: string;
  readonly lastCounts?: ISourceIngestLastCounts;
  readonly lastError?: string | null;
}

export interface IRunListItem {
  readonly runId: string;
  readonly sourceId?: string;
  readonly status: string;
  readonly startedAt: string;
  readonly uploadedAt?: string;
  readonly committedAt?: string;
  readonly abandonedAt?: string;
  readonly error: string | null;
  /** Per-student coverage when stored on the run (client-sent on complete). */
  readonly coverage?: ISlcRunCoverage;
  /** Validation / join-graph / entity-record warnings. */
  readonly warnings?: readonly string[];
  readonly steps?: readonly ISlcIngestRunStep[];
  readonly stats?: ISlcIngestRunStats;
  readonly lastCursor?: ISlcCursor | null;
  readonly newCursor?: ISlcCursor | null;
  readonly clientMeta?: Readonly<Record<string, string>>;
}

/** POST /api/students/:id/sources/:sourceId/runs/trigger — client-led sync (device ingests). */
export interface ITriggerSyncResponse {
  readonly message: string;
  readonly syncRequestId: string;
  readonly studentId: string;
  readonly sourceId: string;
  readonly createdAt: string;
}
