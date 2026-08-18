/**
 * Shared types for the unified client scrape pipeline.
 *
 * Consumed by: scraper-core (runClientScrape), mobile (SyncOrchestrator),
 * browser-extension (content-script), and CLI (BaseScraper adapters).
 */

import type { ISlcIngestEnvelopeV1, ISlcDeltaOp } from '@scholaracle/contracts';
import type { IPageDriver } from '../driver/IPageDriver';
import type { IScraperResolver } from '../registry/module';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type SyncPhase =
  'idle' | 'extracting' | 'transforming' | 'validating' | 'uploading' | 'complete' | 'error';

export interface ISyncProgress {
  readonly phase: SyncPhase;
  readonly message: string;
  readonly opCount?: number;
}

export type SyncProgressCallback = (progress: ISyncProgress) => void;

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

export type SyncFailurePhase = 'portal' | 'upload' | 'local';

export class SyncError extends Error {
  readonly phase: SyncFailurePhase;

  constructor(message: string, phase: SyncFailurePhase, cause?: unknown) {
    super(message);
    this.name = 'SyncError';
    this.phase = phase;
    if (cause !== undefined) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Client type
// ---------------------------------------------------------------------------

export type ClientType = 'mobile' | 'browser-extension' | 'cli';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IClientScrapeConfig {
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly baseUrl: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly studentNameHint?: string;
  /** scraper-core semver string. */
  readonly coreVersion?: string;
}

// ---------------------------------------------------------------------------
// Ingest uploader
// ---------------------------------------------------------------------------

/**
 * Client-side ingest uploader contract.
 *
 * Implementations MUST use the three-step canonical protocol:
 *   POST /api/ingest/v1/runs
 *   POST /api/ingest/v1/runs/:runId/envelope
 *   POST /api/ingest/v1/runs/:runId/complete
 *
 * Each client implementation handles the HTTP details; runClientScrape
 * calls upload() without caring about the underlying steps.
 */
export interface IIngestUploader {
  /**
   * Upload the complete envelope. Implementations handle run registration,
   * envelope delivery, and run completion internally.
   */
  upload(envelope: ISlcIngestEnvelopeV1): Promise<void>;

  /**
   * Report a failed run to the server (extraction or validation failed
   * before upload). Optional — implementations may no-op this.
   */
  reportFailure?(runId: string, sourceId: string, error: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Optional: asset processing (CLI only)
// ---------------------------------------------------------------------------

export interface IAssetHost {
  /**
   * Process ops that contain local file paths or temporary URLs:
   * download assets, upload to permanent storage, rewrite URLs.
   * Returns the mutated ops array.
   */
  processOps(ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]>;
}

// ---------------------------------------------------------------------------
// Optional: join / AI enrichment (fail-open)
// ---------------------------------------------------------------------------

/**
 * Fill empty join fields after transform. Implementations MUST NOT throw
 * in a way that fails the sync — `runClientScrape` swallows errors, timeouts,
 * and illegal patches (invented ids, added/removed ops, overwrites).
 *
 * Allowlisted record fields: courseExternalId, assignmentExternalId, courseName.
 * Native key.externalId is immutable.
 */
export interface IAIEnricher {
  enrich(rawExtract: Record<string, unknown>, ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]>;
}

// ---------------------------------------------------------------------------
// Optional: local run recorder (mobile / CLI)
// ---------------------------------------------------------------------------

export interface IStartRunParams {
  readonly runId: string;
  readonly provider: string;
  readonly studentExternalId: string;
  readonly adapterVersion: string;
  readonly coreVersion: string;
}

export interface IPhaseRecord {
  readonly phase: SyncPhase;
  readonly message: string;
  readonly timestamp: string;
  readonly durationMs: number;
}

export interface IRunResult {
  readonly status: 'success' | 'failed';
  readonly opCount?: number;
  readonly errorMessage?: string;
}

export interface IRunRecorder {
  startRun(params: IStartRunParams): Promise<void>;
  addPhase(runId: string, phase: IPhaseRecord): Promise<void>;
  completeRun(runId: string, result: IRunResult): Promise<void>;
}

// ---------------------------------------------------------------------------
// Host interface
// ---------------------------------------------------------------------------

export interface IClientScrapeHost {
  /** Live, authenticated page driver handed to the module's scrape() call. */
  readonly driver: IPageDriver;
  /** Resolved config for this run. */
  readonly config: IClientScrapeConfig;
  /** Client identifier used in envelope meta. */
  readonly clientType: ClientType;
  /** Three-step ingest uploader. */
  readonly uploader: IIngestUploader;
  /**
   * Optional asset host (CLI only). When present, pipeline processes ops
   * before upload so that local file paths are rewritten to permanent URLs.
   */
  readonly assets?: IAssetHost;
  /**
   * Optional run recorder for local sync history persistence
   * (mobile / CLI). Extension may omit.
   */
  readonly recorder?: IRunRecorder;
  /**
   * Optional extra enricher (LLM, on-device, API). Always runs *after*
   * the built-in JoinGapEnricher. Fail-open: throw/timeout/illegal patch
   * cannot fail the sync.
   */
  readonly enricher?: IAIEnricher;
  /**
   * Timeout for each enricher call. Defaults to DEFAULT_ENRICHER_TIMEOUT_MS.
   */
  readonly enricherTimeoutMs?: number;
  /**
   * Optional resolver override (tests / sideload). Defaults to builtins.
   */
  readonly resolver?: IScraperResolver;
  /** Emit progress events back to the caller UI. */
  readonly onProgress?: SyncProgressCallback;
}
