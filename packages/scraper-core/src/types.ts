/**
 * Shared types used across extractors, recipes, and transformers.
 */

/** Context passed to every transformer so keys are never hardcoded. */
export interface ITransformContext {
  readonly provider: string;
  readonly adapterId: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
}

/** Version metadata stamped on every envelope's run.adapterVersion field. */
export interface IScraperCoreVersion {
  /** scraper-core semver (e.g. "0.1.0") */
  readonly coreVersion: string;
  /** Platform recipe identifier */
  readonly platform: string;
  /** Platform recipe version */
  readonly platformVersion: string;
}

/** Build the adapterVersion string stamped into ISlcRunMeta. */
export function buildAdapterVersion(meta: IScraperCoreVersion): string {
  return `${meta.platform}@${meta.platformVersion}+core@${meta.coreVersion}`;
}
