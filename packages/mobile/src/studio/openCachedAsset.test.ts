import { AssetCache, assetCacheKey, DirectoryAssetCacheStore } from '@scholaracle/studio-core';
import type { IAssetCacheFs } from '@scholaracle/studio-core';
import { openCachedAsset, resetMobileAssetCacheForTests } from './openCachedAsset';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const HASH = 'demo-demo-emma-ap-bio-lab-safety-hash';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function memoryFs(): IAssetCacheFs {
  const files = new Map<string, Uint8Array>();
  return {
    read: async (name) => files.get(name),
    write: async (name, bytes) => {
      files.set(name, bytes);
    },
    remove: async (name) => {
      files.delete(name);
    },
    list: async () => [...files.keys()],
  };
}

describe('mobile asset cache adapter', () => {
  afterEach(() => {
    resetMobileAssetCacheForTests();
  });

  it('DirectoryAssetCacheStore + AssetCache keys by assetId:hash never the signed URL', async () => {
    const fs = memoryFs();
    const store = new DirectoryAssetCacheStore(fs);
    const cache = new AssetCache(store, {
      fetch: async () => ({ status: 200, body: PDF, contentType: 'application/pdf' }),
    });
    const opened = await cache.open({
      assetId: ASSET_ID,
      contentHash: HASH,
      downloadUrl: 'https://cdn.example.test/lab-safety.pdf?sig=ticket',
    });
    expect(opened.cacheKey).toBe(assetCacheKey(ASSET_ID, HASH));
    expect(opened.cacheKey).not.toContain('sig=');
    expect(await store.keys()).toEqual([opened.cacheKey]);
  });

  it('openCachedAsset returns the directory copy when the requested hash is already stored', async () => {
    const fs = memoryFs();
    await new DirectoryAssetCacheStore(fs).set(assetCacheKey(ASSET_ID, HASH), {
      bytes: PDF,
      contentType: 'application/pdf',
    });
    const opened = await openCachedAsset(fs, {
      assetId: ASSET_ID,
      contentHash: HASH,
    });
    expect(opened.fromCache).toBe(true);
    expect(opened.stale).toBe(false);
    expect(Array.from(opened.bytes)).toEqual(Array.from(PDF));
  });
});
