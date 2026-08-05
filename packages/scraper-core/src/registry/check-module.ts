/**
 * Helper checks for sideloaded / registered scraper modules.
 */

import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcDeltaOp,
  type ISlcIngestEnvelopeV1,
} from '@scholaracle/contracts';
import { FakePageDriver, type IFakePageFixture } from '../driver/FakePageDriver';
import type { ScraperProgressCallback } from '../driver/IPageDriver';
import type { ITransformContext } from '../types';
import { validateEnvelope } from '../validator/validator';
import { validateManifestForRun } from './manifest';
import type { IScraperModule, IScraperRuntimeConfig } from './module';

export interface ICheckScraperModuleOptions {
  readonly runFixtures?: boolean;
  readonly fixtures?: Readonly<Record<string, IFakePageFixture>>;
  readonly driver?: FakePageDriver;
  readonly config?: IScraperRuntimeConfig;
  readonly transformContext?: ITransformContext;
  readonly expectedBundleHash?: string;
  readonly progress?: ScraperProgressCallback;
}

const noopProgress: ScraperProgressCallback = () => {};

function providerFromAdapterId(adapterId: string): string {
  const parts = adapterId.split('.');
  return parts.length >= 2 ? parts[parts.length - 1]! : adapterId;
}

/** Wrap ops in a minimal envelope for validateEnvelope. */
export function assembleCheckEnvelope(
  ops: readonly ISlcDeltaOp[],
  module: IScraperModule,
  ctx?: ITransformContext
): ISlcIngestEnvelopeV1 {
  const adapterId = ctx?.adapterId ?? module.metadata.adapterId;
  const provider = ctx?.provider ?? providerFromAdapterId(adapterId);
  const now = new Date().toISOString();
  return {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId: `check-${module.metadata.id}`,
      startedAt: now,
      provider,
      adapterId,
      adapterVersion: module.metadata.version,
      mode: 'delta',
      timezone: 'UTC',
    },
    source: {
      sourceId: `check-source-${module.metadata.id}`,
      displayName: module.metadata.name,
    },
    ops,
  };
}

/**
 * Run Helper checks against a scraper module.
 * Returns structured error strings; empty array means runnable.
 */
export async function checkScraperModule(
  module: IScraperModule,
  options: ICheckScraperModuleOptions = {}
): Promise<readonly string[]> {
  const errors: string[] = [];

  if (typeof module?.scrape !== 'function') {
    errors.push('Missing scrape function');
  }
  if (typeof module?.transform !== 'function') {
    errors.push('Missing transform function');
  }

  if (!module?.metadata) {
    errors.push('Missing metadata');
    return errors;
  }

  const manifestResult = validateManifestForRun(module.metadata);
  if (!manifestResult.ok) {
    errors.push(...manifestResult.errors.map((e) => `Manifest: ${e}`));
  }

  if (options.expectedBundleHash !== undefined) {
    if (!module.metadata.bundleHash) {
      errors.push('bundleHash missing on manifest but expectedBundleHash was provided');
    } else if (module.metadata.bundleHash !== options.expectedBundleHash) {
      errors.push(
        `bundleHash mismatch: expected "${options.expectedBundleHash}", got "${module.metadata.bundleHash}"`
      );
    }
  }

  if (!options.runFixtures) {
    return errors;
  }

  const declaredSuite = module.metadata.tests?.fixtureSuite;
  const hasFixtures = Boolean(options.fixtures && Object.keys(options.fixtures).length > 0);
  const hasDriver = Boolean(options.driver);

  if (declaredSuite && !hasFixtures && !hasDriver) {
    errors.push(`Fixture suite "${declaredSuite}" declared but no fixtures provided for check`);
    return errors;
  }

  if (typeof module.scrape !== 'function' || typeof module.transform !== 'function') {
    return errors;
  }

  const config: IScraperRuntimeConfig = options.config ?? {
    baseUrl: 'https://fixture.example.com',
  };
  const driver =
    options.driver ??
    new FakePageDriver({
      initialUrl: config.baseUrl,
      fixtures: options.fixtures ?? {},
    });

  const transformContext: ITransformContext = options.transformContext ?? {
    provider: providerFromAdapterId(module.metadata.adapterId),
    adapterId: module.metadata.adapterId,
    studentExternalId: config.studentExternalId ?? 'check-student',
    institutionExternalId: 'check-institution',
  };

  try {
    const raw = await module.scrape({
      driver,
      progress: options.progress ?? noopProgress,
      config,
    });
    const ops = module.transform(raw, transformContext);
    const envelope = assembleCheckEnvelope(ops, module, transformContext);
    const report = validateEnvelope(envelope);
    if (!report.passed) {
      for (const check of report.checks) {
        if (check.severity === 'error') {
          errors.push(`Envelope: ${check.message}`);
        }
      }
      if (errors.filter((e) => e.startsWith('Envelope:')).length === 0) {
        errors.push(`Envelope validation failed (${report.errorCount} errors)`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Fixture run failed: ${message}`);
  }

  return errors;
}
