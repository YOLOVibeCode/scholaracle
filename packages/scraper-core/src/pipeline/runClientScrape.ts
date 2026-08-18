/**
 * runClientScrape — unified client scrape pipeline.
 *
 * All three clients (mobile, browser extension, CLI) call this function after
 * the platform-specific authentication step. It encapsulates:
 *   1. Module resolution (provider → IScraperModule)
 *   2. Extraction (calls module.scrape via IScraperHost)
 *   3. Transformation (calls module.transform)
 *   4. Optional asset processing (CLI only)
 *   5. Envelope assembly + validation
 *   6. Upload via IIngestUploader
 *   7. Optional run recording
 */

import { randomUUID } from './uuid';
import { SLC_INGEST_SCHEMA_VERSION_V1, type ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import { validateEnvelope } from '../validator/validator';
import { BuiltinScraperResolver } from '../registry/resolvers';
import type { IScraperHost } from '../registry/module';
import { SCRAPER_CORE_PACKAGE_VERSION } from '../version';
import type {
  IClientScrapeHost,
  IClientScrapeConfig,
  ISyncProgress,
  SyncPhase,
  IPhaseRecord,
  SyncFailurePhase,
} from './types';
import { SyncError } from './types';
import { applyEnrichersFailOpen, JoinGapEnricher } from './enrichment';

const defaultResolver = new BuiltinScraperResolver();
const defaultJoinGapEnricher = new JoinGapEnricher();

function toSyncError(err: unknown, phase: SyncFailurePhase, fallback: string): SyncError {
  if (err instanceof SyncError) return err;
  const message = err instanceof Error ? err.message : fallback;
  return new SyncError(message, phase, err);
}

function buildScraperHost(
  host: IClientScrapeHost,
  onPhaseProgress: (p: ISyncProgress) => void
): IScraperHost {
  return {
    driver: host.driver,
    config: {
      baseUrl: host.config.baseUrl,
      studentExternalId: host.config.studentExternalId,
      studentNameHint: host.config.studentNameHint,
    },
    progress: (scraperProgress) => {
      onPhaseProgress({
        phase: 'extracting',
        message: scraperProgress.message,
      });
    },
  };
}

function buildEnvelopeMeta(
  host: IClientScrapeHost,
  enrichment?: { source: string; patchCount: number; failed: boolean }
): Readonly<Record<string, string>> {
  const meta: Record<string, string> = {
    clientType: host.clientType,
    coreVersion: host.config.coreVersion ?? SCRAPER_CORE_PACKAGE_VERSION,
    adapterVersion: host.config.adapterVersion,
  };
  if (enrichment) {
    meta['enrichmentSource'] = enrichment.source;
    meta['enrichmentPatchCount'] = String(enrichment.patchCount);
    meta['enrichmentFailed'] = enrichment.failed ? 'true' : 'false';
  }
  return meta;
}

export async function runClientScrape(host: IClientScrapeHost): Promise<ISlcIngestEnvelopeV1> {
  const { config, uploader, recorder, assets, onProgress } = host;
  const resolver = host.resolver ?? defaultResolver;
  const runId = randomUUID();
  const coreVersion = config.coreVersion ?? SCRAPER_CORE_PACKAGE_VERSION;
  const startedAt = new Date().toISOString();

  const phaseStart = { current: Date.now() };

  const emit = async (
    phase: SyncPhase,
    message: string,
    extra?: { opCount?: number }
  ): Promise<void> => {
    const now = Date.now();
    const durationMs = now - phaseStart.current;
    phaseStart.current = now;
    const record: IPhaseRecord = {
      phase,
      message,
      timestamp: new Date(now).toISOString(),
      durationMs,
    };
    if (recorder) {
      await recorder.addPhase(runId, record).catch(() => undefined);
    }
    onProgress?.({ phase, message, ...extra });
  };

  // 0. Register run in local recorder (optional)
  if (recorder) {
    await recorder
      .startRun({
        runId,
        provider: config.provider,
        studentExternalId: config.studentExternalId,
        adapterVersion: config.adapterVersion,
        coreVersion,
      })
      .catch(() => undefined);
  }

  // 1. Resolve module
  const { module } = await resolver.resolve(config.provider).catch((err: unknown) => {
    throw toSyncError(err, 'local', `Unknown provider: ${config.provider}`);
  });

  // 2. Extract (portal step)
  await emit('extracting', 'Extracting data from portal...');

  let raw: Record<string, unknown>;
  try {
    const scraperHost = buildScraperHost(host, (p) => onProgress?.(p));
    raw = await module.scrape(scraperHost);
  } catch (err: unknown) {
    const syncErr = toSyncError(err, 'portal', 'Extract failed');
    if (recorder) {
      await recorder
        .completeRun(runId, { status: 'failed', errorMessage: syncErr.message })
        .catch(() => undefined);
    }
    await uploader.reportFailure?.(runId, config.sourceId, syncErr.message).catch(() => undefined);
    throw syncErr;
  }

  // 3. Transform (local step)
  await emit('transforming', 'Converting data...');

  let ops: ReturnType<typeof module.transform>;
  try {
    const ctx = {
      provider: config.provider,
      adapterId: config.adapterId,
      studentExternalId: config.studentExternalId,
      institutionExternalId: config.institutionExternalId,
    };
    ops = module.transform(raw, ctx);
  } catch (err: unknown) {
    const syncErr = toSyncError(err, 'local', 'Transform failed');
    if (recorder) {
      await recorder
        .completeRun(runId, { status: 'failed', errorMessage: syncErr.message })
        .catch(() => undefined);
    }
    throw syncErr;
  }

  await emit('transforming', `Produced ${ops.length} operations`, { opCount: ops.length });

  // 4. Optional asset processing (CLI only)
  if (assets) {
    try {
      ops = await assets.processOps(ops);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit('transforming', `Asset processing failed — continuing: ${msg}`);
    }
  }

  // 4b. Join-gap enricher (always) then optional host enricher — both fail-open
  await emit('transforming', 'Joining subjects, grades, and resources...');
  const enrichers = host.enricher
    ? [defaultJoinGapEnricher, host.enricher]
    : [defaultJoinGapEnricher];
  const enrichment = await applyEnrichersFailOpen({
    enrichers,
    rawExtract: raw,
    ops,
    timeoutMs: host.enricherTimeoutMs,
    onWarning: (message) => {
      void emit('transforming', `Enrichment warning — continuing: ${message}`);
    },
  });
  ops = enrichment.ops;
  const enrichmentSource = host.enricher ? 'join-gap+host' : 'join-gap';

  // 5. Assemble + validate envelope
  await emit('validating', 'Validating envelope...');

  const endedAt = new Date().toISOString();
  const envelope: ISlcIngestEnvelopeV1 = {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId,
      startedAt,
      endedAt,
      provider: config.provider,
      adapterId: config.adapterId,
      adapterVersion: config.adapterVersion,
      mode: 'delta',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      meta: buildEnvelopeMeta(host, {
        source: enrichmentSource,
        patchCount: enrichment.patchCount,
        failed: enrichment.failed,
      }),
    },
    source: {
      sourceId: config.sourceId,
      displayName: `${config.provider} (${host.clientType})`,
      portalBaseUrl: config.baseUrl,
    },
    ops,
  };

  const report = validateEnvelope(envelope);
  if (!report.passed) {
    const msg = `Envelope validation failed: ${report.errorCount} errors`;
    if (recorder) {
      await recorder
        .completeRun(runId, { status: 'failed', opCount: ops.length, errorMessage: msg })
        .catch(() => undefined);
    }
    await uploader.reportFailure?.(runId, config.sourceId, msg).catch(() => undefined);
    throw new SyncError(msg, 'local');
  }

  // 6. Upload
  await emit('uploading', 'Uploading to Scholaracle...');

  try {
    await uploader.upload(envelope);
  } catch (err: unknown) {
    const syncErr = toSyncError(err, 'upload', 'Upload failed');
    if (recorder) {
      await recorder
        .completeRun(runId, {
          status: 'failed',
          opCount: ops.length,
          errorMessage: syncErr.message,
        })
        .catch(() => undefined);
    }
    throw syncErr;
  }

  // 7. Record success
  if (recorder) {
    await recorder
      .completeRun(runId, { status: 'success', opCount: ops.length })
      .catch(() => undefined);
  }
  await emit('complete', `Sync complete — ${ops.length} ops`, { opCount: ops.length });

  return envelope;
}

/** Build IClientScrapeConfig from any scraper-config-like object. */
export function buildClientScrapeConfig(
  params: Pick<
    IClientScrapeConfig,
    | 'provider'
    | 'adapterId'
    | 'adapterVersion'
    | 'baseUrl'
    | 'sourceId'
    | 'studentExternalId'
    | 'institutionExternalId'
  > &
    Partial<Pick<IClientScrapeConfig, 'studentNameHint' | 'coreVersion'>>
): IClientScrapeConfig {
  return {
    ...params,
    coreVersion: params.coreVersion ?? SCRAPER_CORE_PACKAGE_VERSION,
  };
}
