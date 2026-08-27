import {
  AssetCache,
  DirectoryAssetCacheStore,
  MemoryAssetCacheStore,
  createHttpAssetFetcher,
  type IAssetCacheFs,
  type IAssetRef,
  type ICachedAsset,
} from '@scholaracle/studio-core';

let singleton: AssetCache | undefined;
let boundFs: IAssetCacheFs | undefined;
let memorySingleton: AssetCache | undefined;

export function getMobileAssetCache(fs: IAssetCacheFs): AssetCache {
  if (singleton === undefined || boundFs !== fs) {
    singleton = new AssetCache(new DirectoryAssetCacheStore(fs), createHttpAssetFetcher());
    boundFs = fs;
  }
  return singleton;
}

/** Process-lifetime IAssetCache. No new native module — OTA-safe. */
export function getSessionAssetCache(): AssetCache {
  if (memorySingleton === undefined) {
    memorySingleton = new AssetCache(new MemoryAssetCacheStore(), createHttpAssetFetcher());
  }
  return memorySingleton;
}

export function resetMobileAssetCacheForTests(): void {
  singleton = undefined;
  boundFs = undefined;
  memorySingleton = undefined;
}

export async function openCachedAsset(fs: IAssetCacheFs, ref: IAssetRef): Promise<ICachedAsset> {
  return getMobileAssetCache(fs).open(ref);
}
