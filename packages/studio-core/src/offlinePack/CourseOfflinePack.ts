/**
 * CourseOfflinePack — implementation of ICourseOfflinePack.
 *
 * Saves a full class pack (JSON + bytes) locally so the student can open
 * assignments and PDFs after losing internet access.
 *
 * Full spec: docs/CLASS_OFFLINE_PACK.md §6
 */

import type {
  ICourseOfflinePack,
  ICourseOfflinePackDeps,
  ISavedCoursePack,
  IOfflinePackApiResponse,
} from '@scholaracle/interfaces';
import type { IWorkPackView } from '@scholaracle/contracts';

/** Remove downloadUrl from a pack view so signed URLs are never persisted in IndexedDB. */
function stripDownloadUrls(view: IWorkPackView): IWorkPackView {
  if (view.primaryAsset === undefined || view.primaryAsset === null) {
    return view;
  }
  const { downloadUrl: unusedDownloadUrl, ...restAsset } = view.primaryAsset;
  void unusedDownloadUrl;
  return { ...view, primaryAsset: restAsset };
}

export class CourseOfflinePack implements ICourseOfflinePack {
  private readonly _deps: ICourseOfflinePackDeps;

  constructor(deps: ICourseOfflinePackDeps) {
    this._deps = deps;
  }

  async save(courseExternalId: string): Promise<void> {
    const { assetCache, packStore, fetchPack } = this._deps;

    const response: IOfflinePackApiResponse = await fetchPack(courseExternalId);

    // Pre-fetch all asset bytes into the cache using the signed downloadUrl.
    // Fail-open: one asset miss must not abort the save.
    for (const assetRef of response.assets) {
      try {
        await assetCache.open({
          assetId: assetRef.assetId,
          contentHash: assetRef.contentHash,
          downloadUrl: assetRef.downloadUrl,
        });
      } catch {
        // Skip — student can still read other assets
      }
    }

    // Persist the pack JSON. Strip signed downloadUrls before storing —
    // they expire in 24h and are never the cache key.
    const packs = response.packs.map(stripDownloadUrls);

    const saved: ISavedCoursePack = {
      courseExternalId: response.courseExternalId,
      courseName: response.courseName,
      savedAt: new Date().toISOString(),
      stale: false,
      packs,
    };

    await packStore.set(courseExternalId, saved);
  }

  async load(courseExternalId: string): Promise<ISavedCoursePack | null> {
    return this._deps.packStore.get(courseExternalId);
  }

  async isSaved(courseExternalId: string): Promise<boolean> {
    const pack = await this._deps.packStore.get(courseExternalId);
    return pack !== null;
  }

  async evict(courseExternalId: string): Promise<void> {
    await this._deps.packStore.delete(courseExternalId);
    // Note: we do not evict the bytes from IAssetCache here because the same
    // asset bytes may be referenced by other courses or individual opens.
    // LRU eviction of the asset bytes store is a follow-up (later-lru).
  }
}
