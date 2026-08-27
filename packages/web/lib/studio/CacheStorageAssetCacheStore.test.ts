import { AssetCache, assetCacheKey } from '@scholaracle/studio-core';
import {
  assetCacheRequestUrl,
  CacheStorageAssetCacheStore,
  keyFromCacheRequestUrl,
} from './CacheStorageAssetCacheStore';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const HASH = 'demo-demo-emma-ap-bio-lab-safety-hash';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function memoryCaches(): CacheStorage {
  const buckets = new Map<string, Map<string, Response>>();
  const open = async (name: string): Promise<Cache> => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const map = buckets.get(name)!;
    return {
      match: async (req: RequestInfo | URL) => {
        const stored = map.get(urlOf(req));
        return stored?.clone();
      },
      put: async (req: RequestInfo | URL, res: Response) => {
        map.set(urlOf(req), res);
      },
      delete: async (req: RequestInfo | URL) => map.delete(urlOf(req)),
      keys: async () => [...map.keys()].map((u) => new Request(u)),
      add: async () => undefined,
      addAll: async () => undefined,
      matchAll: async () => [],
    } as unknown as Cache;
  };
  return {
    open,
    has: async (name) => buckets.has(name),
    delete: async (name) => buckets.delete(name),
    keys: async () => [...buckets.keys()],
    match: async () => undefined,
  } as unknown as CacheStorage;
}

function urlOf(req: RequestInfo | URL): string {
  if (typeof req === 'string') return req;
  if (req instanceof URL) return req.toString();
  return req.url;
}

describe('CacheStorageAssetCacheStore', () => {
  it('keys are scholaracle.local/asset-cache/… never the signed downloadUrl', () => {
    const key = assetCacheKey(ASSET_ID, HASH);
    const url = assetCacheRequestUrl(key);
    expect(url).toBe(`https://scholaracle.local/asset-cache/${encodeURIComponent(key)}`);
    expect(url).not.toContain('sig=');
    expect(keyFromCacheRequestUrl(url)).toBe(key);
  });

  it('round-trips bytes and works with AssetCache 304 (no second body write)', async () => {
    const store = new CacheStorageAssetCacheStore(memoryCaches());
    const key = assetCacheKey(ASSET_ID, HASH);
    await store.set(key, { bytes: PDF, contentType: 'application/pdf' });
    const hit = await store.get(key);
    expect(hit?.contentType).toBe('application/pdf');
    expect(Array.from(hit?.bytes ?? [])).toEqual(Array.from(PDF));

    const fetchFn = jest.fn(async () => ({ status: 304, body: null }));
    const cache = new AssetCache(store, { fetch: fetchFn });
    const opened = await cache.open({
      assetId: ASSET_ID,
      contentHash: HASH,
      downloadUrl: 'https://cdn.example.test/lab-safety.pdf?sig=ticket',
    });
    expect(opened.fromCache).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await store.keys()).toEqual([key]);
    expect((await store.keys())[0]).not.toContain('sig=');
  });
});
