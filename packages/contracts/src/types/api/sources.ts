/**
 * Wire contracts for GET /api/students/:id/sources and
 * GET /api/students/:id/sources/:sourceId/runs.
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts.
 * Note: a data source only appears in the list if a matching IngestSource
 * record exists (created via POST /api/ingest/v1/sources).
 */

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
  readonly lastError?: string | null;
}

export interface IRunListItem {
  readonly runId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly uploadedAt?: string;
  readonly committedAt?: string;
  readonly error: string | null;
}
