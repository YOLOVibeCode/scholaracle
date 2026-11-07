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

// Page functions: build-time source table for engines without function source (Hermes)
export { PAGE_FNS } from './page-fns/registry';
export { resolvePageFn, PageFnUnregisteredError, PAGE_FN_UNREGISTERED } from './page-fns/resolve';
export { getDocumentOuterHtml, isLoginFormShowing } from './page-fns/common-fns';
export { captureSkeleton, type ICaptureSkeletonResult } from './page-fns/captureSkeleton';
export { runPortalStep } from './pipeline/runPortalStep';
export { fetchAssetInWebView, fetchPageInWebView } from './page-fns/asset-fns';
export type {
  IFetchedAsset,
  IFetchedHtml,
  IFetchedBinary,
  IFetchedPage,
} from './page-fns/asset-fns';

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
export type { IRunSkywardRecipeOptions } from './recipes/skyward-recipe';
export { transformSkywardExtract } from './transformers/skyward/skyward-transformer';

// Aeries
export * from './extractors/aeries/aeries-extractors';
export { runAeriesRecipe } from './recipes/aeries-recipe';
export type { IRunAeriesRecipeOptions } from './recipes/aeries-recipe';
export { transformAeriesExtract } from './transformers/aeries/aeries-transformer';

// Portal selector tables (v1 JSON + defaults for page functions)
export { AERIES_SELECTORS_V1 } from './selectors/aeriesV1';
export { SKYWARD_SELECTORS_V1 } from './selectors/skywardV1';
export type { IAeriesSelectorsV1 } from './selectors/aeriesV1';
export type { ISkywardSelectorsV1 } from './selectors/skywardV1';
export { mergeSelectorRecord } from './selectors/mergeSelectorTables';

// Test harness: M4-02 fake portal HTML (Playwright / Express)
export * from './fixtures/fakePortalM402';

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
  ResourceAction,
  IClassifyResourceParams,
} from './pipeline';
export { mapGapKindToRecipeStep, uniqueGapKindsFromCoverage } from './repair/gapKindToRecipeStep';
export { selectorTableJsonForRecipe } from './repair/selectorTableJson';
export { meetsAeriesCountStandard } from './repair/replayCountStandard';
// Replay and promote helpers use node:fs and jsdom: import them from
// '@scholaracle/scraper-core/dist/node' (see node.ts). The mobile app bundles this index.
export {
  SyncError,
  runClientScrape,
  buildClientScrapeConfig,
  computeRunCoverage,
  JoinGapEnricher,
  applyEnrichersFailOpen,
  sanitizeEnrichedOps,
  DEFAULT_ENRICHER_TIMEOUT_MS,
  classifyResource,
  isInteractiveHost,
  isPortalHost,
  extractPageText,
  EXTRACTED_TEXT_MAX_CHARS,
  buildSimplePdf,
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
  BUILTIN_ADAPTER_ID_ALIASES,
  BUILTIN_MODULES_BY_ADAPTER,
  CANONICAL_BUILTIN_ADAPTER_IDS,
  resolveCanonicalAdapterId,
  isLegacyBuiltinAdapterId,
  LEGACY_BUILTIN_ADAPTER_IDS,
} from './registry';
