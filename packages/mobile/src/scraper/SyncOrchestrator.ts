/**
 * SyncOrchestrator — thin host builder for the unified scrape pipeline.
 *
 * After calling authenticate() externally, callers pass a live IPageDriver
 * to runSyncPipeline(). This delegates to runClientScrape() in scraper-core,
 * removing the per-provider switch and centralizing the pipeline logic.
 */

import {
  runClientScrape,
  SCRAPER_CORE_PACKAGE_VERSION,
  type IPageDriver,
  type IIngestUploader,
  type SyncProgressCallback,
  type IScraperResolver,
  type IAIEnricher,
} from '@scholaracle/scraper-core';
import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
// Re-export pipeline types for existing callers
export type {
  SyncPhase,
  SyncFailurePhase,
  ISyncProgress,
  SyncProgressCallback,
} from '@scholaracle/scraper-core';
export { SyncError } from '@scholaracle/scraper-core';
import type { IEnvelopeUploader, IRunRecorder as IMobileRunRecorder } from '../api/interfaces';
import type {
  IRunRecorder,
  IStartRunParams,
  IPhaseRecord,
  IRunResult,
} from '@scholaracle/scraper-core';

// Exported for callers that inspect the progress shape
export interface ISyncOrchestratorConfig {
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly adapterId: string;
  readonly baseUrl: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly sourceId: string;
  readonly adapterVersion: string;
  readonly coreVersion?: string;
}

/** Optional host slices. Production callers omit this; tests inject a stub resolver. */
export interface ISyncPipelineOverrides {
  readonly resolver?: IScraperResolver;
  readonly enricher?: IAIEnricher;
  readonly enricherTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Adapters: mobile interfaces → scraper-core interfaces
// ---------------------------------------------------------------------------

function buildMobileUploader(uploader: IEnvelopeUploader, connectorToken: string): IIngestUploader {
  return {
    async upload(envelope: ISlcIngestEnvelopeV1): Promise<void> {
      await uploader.uploadEnvelope(envelope, connectorToken);
    },
    async reportFailure(runId: string, sourceId: string, error: string): Promise<void> {
      await uploader
        .reportRunFailure({
          runId,
          sourceId,
          connectorToken,
          error,
          clientMeta: { clientType: 'mobile' },
        })
        .catch(() => undefined);
    },
  };
}

function buildMobileRecorder(mobileRecorder: IMobileRunRecorder): IRunRecorder {
  return {
    async startRun(params: IStartRunParams): Promise<void> {
      await mobileRecorder.startRun({
        runId: params.runId,
        provider: params.provider,
        studentExternalId: params.studentExternalId,
        adapterVersion: params.adapterVersion,
        coreVersion: params.coreVersion,
      });
    },
    async addPhase(runId: string, phase: IPhaseRecord): Promise<void> {
      await mobileRecorder.addPhase(runId, phase);
    },
    async completeRun(runId: string, result: IRunResult): Promise<void> {
      await mobileRecorder.completeRun(runId, result);
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runSyncPipeline(
  driver: IPageDriver,
  config: ISyncOrchestratorConfig,
  uploader: IEnvelopeUploader,
  connectorToken: string,
  recorder: IMobileRunRecorder,
  onProgress?: SyncProgressCallback,
  overrides?: ISyncPipelineOverrides
): Promise<ISlcIngestEnvelopeV1> {
  return runClientScrape({
    driver,
    config: {
      provider: config.provider,
      adapterId: config.adapterId,
      adapterVersion: config.adapterVersion,
      baseUrl: config.baseUrl,
      sourceId: config.sourceId,
      studentExternalId: config.studentExternalId,
      institutionExternalId: config.institutionExternalId,
      coreVersion: config.coreVersion ?? SCRAPER_CORE_PACKAGE_VERSION,
    },
    clientType: 'mobile',
    uploader: buildMobileUploader(uploader, connectorToken),
    recorder: buildMobileRecorder(recorder),
    onProgress,
    resolver: overrides?.resolver,
    enricher: overrides?.enricher,
    enricherTimeoutMs: overrides?.enricherTimeoutMs,
  });
}
