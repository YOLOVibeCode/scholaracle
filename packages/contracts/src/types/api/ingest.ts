/**
 * Wire contracts for the connector-authenticated ingest REST endpoints.
 *
 * Server is source of truth: packages/api/src/routes/ingest/v1/ingest.ts.
 * The envelope itself is separately governed by ISlcIngestEnvelopeV1 in
 * models/Ingest.ts.
 */

/** Request body of POST /api/ingest/v1/sources (upsert semantics). */
export interface IIngestSourceRegisterRequest {
  readonly sourceId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
}

/**
 * Response of POST /api/ingest/v1/sources. `source` is the stored
 * IngestSource record; clients should treat it as opaque.
 */
export interface IIngestSourceRegisterResponse {
  readonly success: boolean;
  readonly source: unknown;
}

/** Response of POST /api/ingest/v1/runs. */
export interface IIngestRunStartResponse {
  readonly success: boolean;
  readonly runId: string;
  readonly mode: 'delta';
  readonly lastCursor: { readonly type: 'opaque'; readonly value: string } | null;
}

/** Response of POST /api/ingest/v1/runs/:id/envelope. */
export interface IIngestEnvelopeAcceptResponse {
  readonly success: boolean;
  readonly accepted: boolean;
}

/** Response of POST /api/ingest/v1/runs/:id/complete (success path). */
export interface IIngestRunCompleteResponse {
  readonly success: boolean;
  readonly committed: boolean;
  readonly newCursor: { readonly type: 'opaque'; readonly value: string } | null;
  readonly derivedAlertsQueued: boolean;
}

/** Response of POST /api/ingest/v1/runs/:id/complete (failed path). */
export interface IIngestRunFailedResponse {
  readonly success: boolean;
  readonly committed: false;
  readonly failed: true;
  readonly error?: string;
}
