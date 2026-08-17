/**
 * @scholaracle/scraper-core
 *
 * Runtime-agnostic scraper core: IPageDriver interface, browser-context
 * extractors, per-platform recipes, transformers, and envelope validator.
 *
 * Consumed by:
 *   - @scholaracle/scraper-playwright   (local CLI — runs on the user's machine)
 *   - packages/mobile                   (Expo/React Native WebView driver)
 *   - packages/extension                (Chrome/Edge MV3 content script driver)
 */

// Driver interface + ISP slices + test fake
export type {
  IPageDriver,
  IGotoOptions,
  IWaitOptions,
  BrowserFn,
  ScraperPhase,
  IScraperProgress,
  ScraperProgressCallback,
} from './driver/IPageDriver';
export type {
  IPageNavigator,
  IPageEvaluator,
  IPopupObserver,
  IFakePageFixture,
  IFakePageDriverOptions,
} from './driver/FakePageDriver';
export { FakePageDriver } from './driver/FakePageDriver';

// Version / bundle stamp
export { EXTRACTOR_BUNDLE_HASH, SCRAPER_CORE_PACKAGE_VERSION } from './version';

// Shared types
export type { ITransformContext, IScraperCoreVersion } from './types';
export { buildAdapterVersion } from './types';

// Canvas
export * from './extractors/canvas/canvas-extractors';
export { runCanvasRecipe } from './recipes/canvas-recipe';
export {
  transformCanvasExtract,
  matchMaterialsToAssignments,
} from './transformers/canvas/canvas-transformer';

// Skyward
export * from './extractors/skyward/skyward-extractors';
export { runSkywardRecipe } from './recipes/skyward-recipe';
export { transformSkywardExtract } from './transformers/skyward/skyward-transformer';

// Aeries
export * from './extractors/aeries/aeries-extractors';
export { runAeriesRecipe } from './recipes/aeries-recipe';
export { transformAeriesExtract } from './transformers/aeries/aeries-transformer';

// Validator
export { validateEnvelope, validateOp } from './validator/validator';
export type {
  IEnvelopeValidationReport,
  IValidationCheck,
  IOpValidationResult,
} from './validator/validator';

// Unified client pipeline: runClientScrape, IClientScrapeHost, IIngestUploader, etc.
export type {
  SyncPhase,
  ISyncProgress,
  SyncProgressCallback,
  SyncFailurePhase,
  ClientType,
  IClientScrapeConfig,
  IIngestUploader,
  IAssetHost,
  IAIEnricher,
  IStartRunParams,
  IPhaseRecord,
  IRunResult,
  IRunRecorder,
  IClientScrapeHost,
} from './pipeline';
export {
  SyncError,
  runClientScrape,
  buildClientScrapeConfig,
  JoinGapEnricher,
  applyEnrichersFailOpen,
  sanitizeEnrichedOps,
  DEFAULT_ENRICHER_TIMEOUT_MS,
} from './pipeline';

// Community Scraper Platform (CSP-1): manifest + module contract + resolvers
export type {
  IScraperManifest,
  ManifestRunValidation,
  IScraperRuntimeConfig,
  IScraperHost,
  IScraperModule,
  IScraperResolveResult,
  IScraperResolver,
  ICheckScraperModuleOptions,
} from './registry';
export {
  parseScraperManifest,
  matchHost,
  validateManifestForRun,
  isSemver,
  checkScraperModule,
  assembleCheckEnvelope,
  BuiltinScraperResolver,
  SideloadScraperResolver,
  CompositeScraperResolver,
  canvasBuiltinModule,
  skywardBuiltinModule,
  aeriesBuiltinModule,
  BUILTIN_ALIAS_TO_ADAPTER,
  BUILTIN_MODULES_BY_ADAPTER,
} from './registry';
