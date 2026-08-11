/**
 * SyncOrchestrator — on-device scrape → transform → validate → upload.
 * Depends on ISP slices (IEnvelopeUploader, IRunRecorder), not the concrete API client.
 */

import * as Crypto from 'expo-crypto';
import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
} from '@scholaracle/contracts';
import {
  runCanvasRecipe,
  runSkywardRecipe,
  runAeriesRecipe,
  transformCanvasExtract,
  transformSkywardExtract,
  transformAeriesExtract,
  validateEnvelope,
  type ICanvasBrowserExtract,
  type ISkywardFullExtract,
  type IAeriesFullExtract,
  type IPageDriver,
} from '@scholaracle/scraper-core';
import type { IEnvelopeUploader, IRunRecorder } from '../api/interfaces';

export type SyncPhase =
  'idle' | 'extracting' | 'transforming' | 'validating' | 'uploading' | 'complete' | 'error';

/** Where in the pipeline a sync failure originated. */
export type SyncFailurePhase = 'portal' | 'upload' | 'local';

/**
 * Typed pipeline failure. `phase` tells callers where it broke:
 *  - 'portal': scraping/extraction against the school portal (session issues live here)
 *  - 'local':  on-device transform/validation
 *  - 'upload': HTTP upload to Scholaracle
 * The underlying error is preserved in `cause`.
 */
export class SyncError extends Error {
  readonly phase: SyncFailurePhase;

  constructor(message: string, phase: SyncFailurePhase, cause?: unknown) {
    super(message);
    this.name = 'SyncError';
    this.phase = phase;
    if (cause !== undefined) this.cause = cause;
  }
}

function toSyncError(err: unknown, phase: SyncFailurePhase, fallbackMessage: string): SyncError {
  if (err instanceof SyncError) return err;
  const message = err instanceof Error ? err.message : fallbackMessage;
  return new SyncError(message, phase, err);
}

export interface ISyncProgress {
  readonly phase: SyncPhase;
  readonly message: string;
  readonly opCount?: number;
}

export type SyncProgressCallback = (progress: ISyncProgress) => void;

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

export async function runSyncPipeline(
  driver: IPageDriver,
  config: ISyncOrchestratorConfig,
  uploader: IEnvelopeUploader,
  connectorToken: string,
  recorder: IRunRecorder,
  onProgress?: SyncProgressCallback
): Promise<ISlcIngestEnvelopeV1> {
  const runId = Crypto.randomUUID();
  const coreVersion = config.coreVersion ?? '0.1.0';
  const clientMeta = {
    clientType: 'mobile',
    coreVersion,
    adapterVersion: config.adapterVersion,
  };

  await recorder.startRun({
    runId,
    provider: config.provider,
    studentExternalId: config.studentExternalId,
    adapterVersion: config.adapterVersion,
    coreVersion,
  });

  const phaseStart = { current: Date.now() };
  const emitPhase = async (
    phase: SyncPhase,
    message: string,
    extra?: { opCount?: number }
  ): Promise<void> => {
    const now = Date.now();
    await recorder.addPhase(runId, {
      phase,
      message,
      timestamp: new Date().toISOString(),
      durationMs: now - phaseStart.current,
    });
    phaseStart.current = now;
    onProgress?.({ phase, message, ...extra });
  };
  const emitProgress = async (progress: ISyncProgress): Promise<void> => {
    await emitPhase(progress.phase, progress.message, { opCount: progress.opCount });
  };

  const ctx = {
    provider: config.provider,
    adapterId: config.adapterId,
    studentExternalId: config.studentExternalId,
    institutionExternalId: config.institutionExternalId,
  };

  let ops: ISlcDeltaOp[];
  try {
    await emitPhase('extracting', 'Extracting data from portal...');
    ops = await extractAndTransform(driver, config, ctx, emitProgress);
  } catch (err: unknown) {
    // extractAndTransform already tags portal vs local; anything else that
    // escapes this block is treated as a portal-side extraction failure.
    const syncErr = toSyncError(err, 'portal', 'Extract/transform failed');
    await recorder.completeRun(runId, { status: 'failed', errorMessage: syncErr.message });
    await uploader
      .reportRunFailure({
        runId,
        sourceId: config.sourceId,
        connectorToken,
        error: syncErr.message,
        clientMeta,
      })
      .catch(() => undefined);
    throw syncErr;
  }

  await emitPhase('transforming', `Produced ${ops.length} operations`, { opCount: ops.length });
  await emitPhase('validating', 'Validating envelope...');

  const now = new Date().toISOString();
  const envelope: ISlcIngestEnvelopeV1 = {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId,
      startedAt: now,
      endedAt: new Date().toISOString(),
      provider: config.provider,
      adapterId: config.adapterId,
      adapterVersion: config.adapterVersion,
      mode: 'delta',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      meta: clientMeta,
    },
    source: {
      sourceId: config.sourceId,
      displayName: `${config.provider} (mobile)`,
      portalBaseUrl: config.baseUrl,
    },
    ops,
  };

  const report = validateEnvelope(envelope);
  if (!report.passed) {
    const msg = `Envelope validation failed: ${report.errorCount} errors`;
    await recorder.completeRun(runId, { status: 'failed', opCount: ops.length, errorMessage: msg });
    await uploader
      .reportRunFailure({
        runId,
        sourceId: config.sourceId,
        connectorToken,
        error: msg,
        clientMeta,
      })
      .catch(() => undefined);
    throw new SyncError(msg, 'local');
  }

  await emitPhase('uploading', 'Uploading to Scholaracle...');
  try {
    await uploader.uploadEnvelope(envelope, connectorToken);
  } catch (err: unknown) {
    const syncErr = toSyncError(err, 'upload', 'Upload failed');
    await recorder.completeRun(runId, {
      status: 'failed',
      opCount: ops.length,
      errorMessage: syncErr.message,
    });
    throw syncErr;
  }

  await recorder.completeRun(runId, { status: 'success', opCount: ops.length });
  await emitPhase('complete', `Sync complete — ${ops.length} ops`, { opCount: ops.length });
  return envelope;
}

/** Run a portal-facing step; failures become SyncError phase 'portal'. */
async function runPortalStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (err: unknown) {
    throw toSyncError(err, 'portal', 'Portal extraction failed');
  }
}

/** Run an on-device step; failures become SyncError phase 'local'. */
function runLocalStep<T>(step: () => T): T {
  try {
    return step();
  } catch (err: unknown) {
    throw toSyncError(err, 'local', 'Transform failed');
  }
}

async function extractAndTransform(
  driver: IPageDriver,
  config: ISyncOrchestratorConfig,
  ctx: {
    provider: string;
    adapterId: string;
    studentExternalId: string;
    institutionExternalId: string;
  },
  emit: (progress: ISyncProgress) => Promise<void>
): Promise<ISlcDeltaOp[]> {
  if (config.provider === 'canvas') {
    const raw: ICanvasBrowserExtract = await runPortalStep(() =>
      runCanvasRecipe(driver, config.baseUrl)
    );
    await emit({ phase: 'transforming', message: 'Converting data...' });
    return runLocalStep(() => transformCanvasExtract(raw, ctx));
  }
  if (config.provider === 'skyward') {
    const raw: ISkywardFullExtract = await runPortalStep(() =>
      runSkywardRecipe(driver, config.baseUrl)
    );
    await emit({ phase: 'transforming', message: 'Converting data...' });
    return runLocalStep(() => transformSkywardExtract(raw, ctx));
  }
  if (config.provider === 'aeries') {
    const raw: IAeriesFullExtract = await runPortalStep(() =>
      runAeriesRecipe(driver, config.baseUrl)
    );
    await emit({ phase: 'transforming', message: 'Converting data...' });
    return runLocalStep(() => {
      const filtered: IAeriesFullExtract =
        config.studentExternalId === 'default'
          ? raw
          : {
              ...raw,
              students: raw.students.filter((s) => s.studentId === config.studentExternalId),
            };
      return transformAeriesExtract(filtered.students.length > 0 ? filtered : raw, ctx);
    });
  }
  throw new SyncError(`Unknown provider: ${config.provider as string}`, 'local');
}
