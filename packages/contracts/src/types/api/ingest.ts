/**
 * Wire contracts for the connector-authenticated ingest REST endpoints.
 *
 * Server is source of truth: packages/api/src/routes/ingest/v1/ingest.ts.
 * The envelope itself is separately governed by ISlcIngestEnvelopeV1 in
 * models/Ingest.ts.
 */

import type { ISlcIngestRunStats, ISlcIngestRunStep, ISlcRunCoverage } from '../../models/Ingest';

/** Request body of POST /api/ingest/v1/runs/:runId/complete (success path). */
export interface IIngestRunCompleteRequest {
  readonly status?: 'success' | 'failed';
  readonly error?: string;
  readonly cursor?: { readonly type: 'opaque'; readonly value: string };
  readonly coverage?: ISlcRunCoverage;
  readonly warnings?: readonly string[];
  /** SHA-256 hex of sanitized page skeleton for district-level repair dedupe. */
  readonly skeletonHash?: string;
  /** Served selector patch the client applied for this sync (verification). */
  readonly appliedSelectorPatchId?: string;
}

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
  /** Present when post-ingest LLM work hit the relay budget cap; sync still committed. */
  readonly codes?: readonly string[];
}

/** Response of POST /api/ingest/v1/runs/:id/complete (failed path). */
export interface IIngestRunFailedResponse {
  readonly success: boolean;
  readonly committed: false;
  readonly failed: true;
  readonly error?: string;
}

/** Request body of POST /api/ingest/v1/runs/:id/trace */
export interface IIngestRunTraceRequest {
  readonly step: ISlcIngestRunStep;
  readonly stats?: ISlcIngestRunStats;
  readonly warnings?: readonly string[];
}

/** Response of POST /api/ingest/v1/runs/:id/trace */
export interface IIngestRunTraceResponse {
  readonly success: boolean;
}

/** Sanitized structural DOM snapshot from `common.captureSkeleton` on the device. */
export interface ISanitizedPageSkeletonCapture {
  readonly step: string;
  readonly capturedAt: string;
  readonly pagePath?: string;
  readonly skeleton: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly truncated?: boolean;
}

/** Request body of POST /api/ingest/v1/runs/:runId/skeletons. */
export interface IIngestRunSkeletonUploadRequest {
  readonly step: string;
  readonly capturedAt: string;
  readonly pagePath?: string;
  readonly skeleton: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly truncated?: boolean;
}

/** Response of POST /api/ingest/v1/runs/:runId/skeletons. */
export interface IIngestRunSkeletonUploadResponse {
  readonly success: boolean;
  readonly storageKey: string;
  readonly expiresAt: string;
}
