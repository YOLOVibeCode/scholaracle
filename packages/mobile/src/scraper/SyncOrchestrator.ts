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
  const emitPhase = (phase: SyncPhase, message: string, extra?: { opCount?: number }): void => {
    const now = Date.now();
    void recorder.addPhase(runId, {
      phase,
      message,
      timestamp: new Date().toISOString(),
      durationMs: now - phaseStart.current,
    });
    phaseStart.current = now;
    onProgress?.({ phase, message, ...extra });
  };
  const emitProgress: SyncProgressCallback = (progress) => {
    emitPhase(progress.phase, progress.message, { opCount: progress.opCount });
  };

  const ctx = {
    provider: config.provider,
    adapterId: config.adapterId,
    studentExternalId: config.studentExternalId,
    institutionExternalId: config.institutionExternalId,
  };

  let ops: ISlcDeltaOp[];
  try {
    emitPhase('extracting', 'Extracting data from portal...');
    ops = await extractAndTransform(driver, config, ctx, emitProgress);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Extract/transform failed';
    await recorder.completeRun(runId, { status: 'failed', errorMessage: msg });
    await uploader
      .reportRunFailure({
        runId,
        sourceId: config.sourceId,
        connectorToken,
        error: msg,
        clientMeta,
      })
      .catch(() => undefined);
    throw err;
  }

  emitPhase('transforming', `Produced ${ops.length} operations`, { opCount: ops.length });
  emitPhase('validating', 'Validating envelope...');

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
    throw new Error(msg);
  }

  emitPhase('uploading', 'Uploading to Scholaracle...');
  try {
    await uploader.uploadEnvelope(envelope, connectorToken);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    await recorder.completeRun(runId, { status: 'failed', opCount: ops.length, errorMessage: msg });
    throw err;
  }

  await recorder.completeRun(runId, { status: 'success', opCount: ops.length });
  emitPhase('complete', `Sync complete — ${ops.length} ops`, { opCount: ops.length });
  return envelope;
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
  emit: SyncProgressCallback
): Promise<ISlcDeltaOp[]> {
  if (config.provider === 'canvas') {
    const raw: ICanvasBrowserExtract = await runCanvasRecipe(driver, config.baseUrl);
    emit({ phase: 'transforming', message: 'Converting data...' });
    return transformCanvasExtract(raw, ctx);
  }
  if (config.provider === 'skyward') {
    const raw: ISkywardFullExtract = await runSkywardRecipe(driver, config.baseUrl);
    emit({ phase: 'transforming', message: 'Converting data...' });
    return transformSkywardExtract(raw, ctx);
  }
  if (config.provider === 'aeries') {
    const raw: IAeriesFullExtract = await runAeriesRecipe(driver, config.baseUrl);
    emit({ phase: 'transforming', message: 'Converting data...' });
    const filtered: IAeriesFullExtract =
      config.studentExternalId === 'default'
        ? raw
        : {
            ...raw,
            students: raw.students.filter((s) => s.studentId === config.studentExternalId),
          };
    return transformAeriesExtract(filtered.students.length > 0 ? filtered : raw, ctx);
  }
  throw new Error(`Unknown provider: ${config.provider}`);
}
