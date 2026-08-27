import type { IAssetCacheStore, IStoredCachedAsset } from '@scholaracle/studio-core';

export const ASSET_CACHE_NAME = 'scholaracle-asset-cache-v1';

/** Fake URL used as the Cache Storage request key — never the signed downloadUrl. */
export function assetCacheRequestUrl(key: string): string {
  return `https://scholaracle.local/asset-cache/${encodeURIComponent(key)}`;
}

/**
 * Browser Cache Storage adapter for IAssetCacheStore.
 */
export class CacheStorageAssetCacheStore implements IAssetCacheStore {
  constructor(
    private readonly _caches: CacheStorage,
    private readonly _cacheName = ASSET_CACHE_NAME
  ) {}

  public async get(key: string): Promise<IStoredCachedAsset | undefined> {
    const cache = await this._caches.open(this._cacheName);
    const res = await cache.match(assetCacheRequestUrl(key));
    if (res === undefined) return undefined;
    const copy = res.clone();
    const bytes = new Uint8Array(await copy.arrayBuffer());
    const contentType = copy.headers.get('content-type') ?? 'application/octet-stream';
    return { bytes, contentType };
  }

  public async set(key: string, value: IStoredCachedAsset): Promise<void> {
    const cache = await this._caches.open(this._cacheName);
    const copy = new Uint8Array(value.bytes.byteLength);
    copy.set(value.bytes);
    await cache.put(
      assetCacheRequestUrl(key),
      new Response(copy, {
        headers: { 'Content-Type': value.contentType },
      })
    );
  }

  public async delete(key: string): Promise<void> {
    const cache = await this._caches.open(this._cacheName);
    await cache.delete(assetCacheRequestUrl(key));
  }

  public async keys(): Promise<readonly string[]> {
    const cache = await this._caches.open(this._cacheName);
    const requests = await cache.keys();
    const out: string[] = [];
    for (const req of requests) {
      const parsed = keyFromCacheRequestUrl(req.url);
      if (parsed !== undefined) out.push(parsed);
    }
    return out;
  }
}

export function keyFromCacheRequestUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const prefix = '/asset-cache/';
    if (!path.startsWith(prefix)) return undefined;
    return decodeURIComponent(path.slice(prefix.length));
  } catch {
    return undefined;
  }
}
