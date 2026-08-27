import { AssetCache, assetCacheKey } from './AssetCache';
import { DirectoryAssetCacheStore, type IAssetCacheFs } from './DirectoryAssetCacheStore';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const HASH_V1 = 'demo-demo-emma-ap-bio-lab-safety-hash';
const HASH_V2 = 'demo-demo-emma-ap-bio-lab-safety-hash-v2';
const PDF_V1 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const PDF_V2 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]);

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

describe('DirectoryAssetCacheStore', () => {
  it('round-trips bytes keyed by assetId:hash, never the signed URL', async () => {
    const store = new DirectoryAssetCacheStore(memoryFs());
    const key = assetCacheKey(ASSET_ID, HASH_V1);
    await store.set(key, { bytes: PDF_V1, contentType: 'application/pdf' });
    const hit = await store.get(key);
    expect(hit?.contentType).toBe('application/pdf');
    expect(Array.from(hit?.bytes ?? [])).toEqual(Array.from(PDF_V1));
    expect(await store.keys()).toEqual([key]);
    expect((await store.keys())[0]).not.toContain('sig=');
  });

  it('works as the AssetCache store: new hash deletes the old key', async () => {
    const store = new DirectoryAssetCacheStore(memoryFs());
    const fetcher = {
      fetch: jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          body: PDF_V1,
          contentType: 'application/pdf',
        })
        .mockResolvedValueOnce({
          status: 200,
          body: PDF_V2,
          contentType: 'application/pdf',
        }),
    };
    const cache = new AssetCache(store, fetcher);
    await cache.open({
      assetId: ASSET_ID,
      contentHash: HASH_V1,
      downloadUrl: 'https://cdn.example.test/a.pdf?sig=aaa',
    });
    await cache.open({
      assetId: ASSET_ID,
      contentHash: HASH_V2,
      downloadUrl: 'https://cdn.example.test/a.pdf?sig=bbb',
    });
    expect(await store.keys()).toEqual([`${ASSET_ID}:${HASH_V2}`]);
  });
});
