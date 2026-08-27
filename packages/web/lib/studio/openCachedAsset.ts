import {
  AssetCache,
  createHttpAssetFetcher,
  type IAssetRef,
  type ICachedAsset,
} from '@scholaracle/studio-core';
import { CacheStorageAssetCacheStore } from './CacheStorageAssetCacheStore';

let singleton: AssetCache | undefined;

export function getBrowserAssetCache(): AssetCache {
  if (typeof caches === 'undefined') {
    throw new Error('Cache Storage is not available');
  }
  if (singleton === undefined) {
    singleton = new AssetCache(
      new CacheStorageAssetCacheStore(caches),
      createHttpAssetFetcher()
    );
  }
  return singleton;
}

export function resetBrowserAssetCacheForTests(): void {
  singleton = undefined;
}

export async function openCachedAsset(ref: IAssetRef): Promise<ICachedAsset> {
  return getBrowserAssetCache().open(ref);
}
