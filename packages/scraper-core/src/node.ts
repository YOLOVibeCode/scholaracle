/**
 * Node-only entry (`@scholaracle/scraper-core/dist/node`). These modules use node:fs and the
 * jsdom replay driver, so they must not be re-exported from `index.ts`: the mobile app
 * bundles scraper-core with Metro, which cannot resolve Node built-ins.
 */
export { replaySelectorPatch } from './repair/replaySelectorPatch';
export type {
  IReplaySelectorPatchParams,
  IReplaySelectorPatchResult,
} from './repair/replaySelectorPatch';
export {
  applySelectorPatchToTableJson,
  buildPromoteSelectorPatchArtifacts,
} from './repair/buildPromoteSelectorPatchArtifacts';
