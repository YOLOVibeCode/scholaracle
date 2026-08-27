/**
 * Singleton-like factory for CourseOfflinePack in the web browser.
 *
 * Wires together:
 *   - AssetCache (CacheStorageAssetCacheStore + HttpAssetFetcher)
 *   - IndexedDbPackStore (pack JSON)
 *   - fetchOfflinePack (API call, requires token)
 *
 * Because CacheStorage and IndexedDB are only available in the browser,
 * this module must not be imported during SSR.
 */

'use client';

import { CourseOfflinePack, AssetCache, createHttpAssetFetcher } from '@scholaracle/studio-core';
import { CacheStorageAssetCacheStore } from './CacheStorageAssetCacheStore';
import { IndexedDbPackStore } from './indexedDbPackStore';
import { fetchOfflinePack } from '../api/studio';

export function createOfflinePackManager(token: string): CourseOfflinePack {
  const assetCache = new AssetCache(
    new CacheStorageAssetCacheStore(caches),
    createHttpAssetFetcher()
  );
  const packStore = new IndexedDbPackStore();

  return new CourseOfflinePack({
    assetCache,
    packStore,
    fetchPack: (courseExternalId) => fetchOfflinePack(token, courseExternalId),
  });
}
