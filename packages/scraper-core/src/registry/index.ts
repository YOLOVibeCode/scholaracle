/**
 * Community Scraper Platform registry exports.
 */

export type { IScraperManifest, ManifestRunValidation } from './manifest';
export { parseScraperManifest, matchHost, validateManifestForRun, isSemver } from './manifest';

export type {
  IScraperRuntimeConfig,
  IScraperHost,
  IScraperModule,
  IScraperResolveResult,
  IScraperResolver,
} from './module';

export type { ICheckScraperModuleOptions } from './check-module';
export { checkScraperModule, assembleCheckEnvelope } from './check-module';

export {
  BuiltinScraperResolver,
  SideloadScraperResolver,
  CompositeScraperResolver,
} from './resolvers';

export {
  canvasBuiltinModule,
  skywardBuiltinModule,
  aeriesBuiltinModule,
  BUILTIN_ALIAS_TO_ADAPTER,
  BUILTIN_MODULES_BY_ADAPTER,
} from './builtin-modules';
