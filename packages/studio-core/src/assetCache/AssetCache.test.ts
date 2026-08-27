/**
 * Slice 3 — IAssetCache in-memory tests.
 *
 * Fake IAssetFetcher + MemoryAssetCacheStore. No browser, no Express.
 * Cache key is `${assetId}:${contentHash}` — never the signed downloadUrl.
 */

import type { IAssetFetchInit, IAssetFetcher, IAssetRef } from '@scholaracle/interfaces';
import { AssetCache, assetCacheKey } from './AssetCache';
import { AssetCacheError } from './AssetCacheError';
import { MemoryAssetCacheStore } from './MemoryAssetCacheStore';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const OTHER_ID = 'demo-asset-other';
const HASH_V1 = 'demo-demo-emma-ap-bio-lab-safety-hash';
const HASH_V2 = 'demo-demo-emma-ap-bio-lab-safety-hash-v2';
const PDF_V1 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const PDF_V2 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]);
const URL_A = 'https://cdn.example.test/assets/lab-safety.pdf?sig=ticket-aaa';
const URL_B = 'https://cdn.example.test/assets/lab-safety.pdf?sig=ticket-bbb';

function ref(overrides: Partial<IAssetRef> = {}): IAssetRef {
  return {
    assetId: ASSET_ID,
    contentHash: HASH_V1,
    downloadUrl: URL_A,
    ...overrides,
  };
}

function fakeFetcher(
  handler: (
    url: string,
    init: IAssetFetchInit
  ) => Promise<{
    status: number;
    body: Uint8Array | null;
    contentType?: string;
  }>
): { fetcher: IAssetFetcher; calls: Array<{ url: string; ifNoneMatch?: string }> } {
  const calls: Array<{ url: string; ifNoneMatch?: string }> = [];
  return {
    calls,
    fetcher: {
      fetch: async (url, init) => {
        calls.push({ url, ifNoneMatch: init.ifNoneMatch });
        return handler(url, init);
      },
    },
  };
}

function okPdf(bytes: Uint8Array): ReturnType<typeof fakeFetcher> {
  return fakeFetcher(async () => ({
    status: 200,
    body: bytes,
    contentType: 'application/pdf',
  }));
}

function networkDown(): ReturnType<typeof fakeFetcher> {
  return fakeFetcher(async () => {
    throw new Error('network down');
  });
}

describe('assetCacheKey', () => {
  it('is assetId:contentHash and never includes the signed URL', () => {
    const key = assetCacheKey(ASSET_ID, HASH_V1);
    expect(key).toBe(`${ASSET_ID}:${HASH_V1}`);
    expect(key).not.toContain('sig=');
    expect(key).not.toContain('https://');
  });
});

describe('AssetCache', () => {
  it('same assetId + same contentHash → second open does not re-download the body', async () => {
    const store = new MemoryAssetCacheStore();
    const firstFetch = okPdf(PDF_V1);
    const first = await new AssetCache(store, firstFetch.fetcher).open(ref());
    expect(first.fromCache).toBe(false);
    expect(Array.from(first.bytes)).toEqual(Array.from(PDF_V1));
    expect(first.cacheKey).toBe(`${ASSET_ID}:${HASH_V1}`);

    const secondFetch = fakeFetcher(async () => ({ status: 304, body: null }));
    const second = await new AssetCache(store, secondFetch.fetcher).open(
      ref({ downloadUrl: URL_B })
    );
    expect(second.fromCache).toBe(true);
    expect(second.stale).toBe(false);
    expect(Array.from(second.bytes)).toEqual(Array.from(PDF_V1));
    expect(secondFetch.calls).toHaveLength(1);
    expect(secondFetch.calls[0]?.ifNoneMatch).toBe(`"${HASH_V1}"`);
    expect(store.writeCount).toBe(1);
  });

  it('same assetId + new contentHash → fetch once, new bytes stored, old key deleted', async () => {
    const store = new MemoryAssetCacheStore();
    await new AssetCache(store, okPdf(PDF_V1).fetcher).open(ref());
    expect(await store.keys()).toEqual([`${ASSET_ID}:${HASH_V1}`]);

    const v2 = await new AssetCache(store, okPdf(PDF_V2).fetcher).open(
      ref({ contentHash: HASH_V2, downloadUrl: URL_B })
    );
    expect(Array.from(v2.bytes)).toEqual(Array.from(PDF_V2));
    expect(v2.cacheKey).toBe(`${ASSET_ID}:${HASH_V2}`);
    expect(v2.fromCache).toBe(false);
    expect(await store.keys()).toEqual([`${ASSET_ID}:${HASH_V2}`]);
  });

  it('different assetId, same hash → distinct client keys (no content-addressed sharing)', async () => {
    const store = new MemoryAssetCacheStore();
    const fake = okPdf(PDF_V1);
    await new AssetCache(store, fake.fetcher).open(ref());
    await new AssetCache(store, fake.fetcher).open(ref({ assetId: OTHER_ID }));
    const keys = [...(await store.keys())].sort();
    expect(keys).toEqual([`${ASSET_ID}:${HASH_V1}`, `${OTHER_ID}:${HASH_V1}`]);
    expect(fake.calls).toHaveLength(2);
  });

  it('network down + cache hit with matching hash → return cached; stale false', async () => {
    const store = new MemoryAssetCacheStore();
    await new AssetCache(store, okPdf(PDF_V1).fetcher).open(ref());
    const result = await new AssetCache(store, networkDown().fetcher).open(ref());
    expect(result.fromCache).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.requestedHashMissing).toBeUndefined();
    expect(Array.from(result.bytes)).toEqual(Array.from(PDF_V1));
  });

  it('network down + no cache → throw a typed AssetCacheError', async () => {
    const cache = new AssetCache(new MemoryAssetCacheStore(), networkDown().fetcher);
    await expect(cache.open(ref())).rejects.toBeInstanceOf(AssetCacheError);
    await expect(cache.open(ref())).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('network down + only an old hash → stale true and requestedHashMissing true', async () => {
    const store = new MemoryAssetCacheStore();
    await new AssetCache(store, okPdf(PDF_V1).fetcher).open(ref());
    const result = await new AssetCache(store, networkDown().fetcher).open(
      ref({ contentHash: HASH_V2, downloadUrl: URL_B })
    );
    expect(result.stale).toBe(true);
    expect(result.requestedHashMissing).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(Array.from(result.bytes)).toEqual(Array.from(PDF_V1));
    expect(result.cacheKey).toBe(`${ASSET_ID}:${HASH_V1}`);
  });

  it('downloadUrl is used for fetch only; cache key is never the signed URL', async () => {
    const store = new MemoryAssetCacheStore();
    const fake = okPdf(PDF_V1);
    const opened = await new AssetCache(store, fake.fetcher).open(ref({ downloadUrl: URL_A }));
    expect(fake.calls[0]?.url).toBe(URL_A);
    expect(opened.cacheKey).not.toContain('sig=');
    expect(opened.cacheKey).not.toContain(URL_A);

    const second = fakeFetcher(async () => ({ status: 304, body: null }));
    await new AssetCache(store, second.fetcher).open(ref({ downloadUrl: URL_B }));
    expect(second.calls[0]?.url).toBe(URL_B);
    expect(await store.keys()).toEqual([`${ASSET_ID}:${HASH_V1}`]);
  });

  it('If-None-Match is the quoted contentHash when we already have that hash; 304 writes no body', async () => {
    const store = new MemoryAssetCacheStore();
    await new AssetCache(store, okPdf(PDF_V1).fetcher).open(ref());
    const writesAfterFirst = store.writeCount;
    const fake = fakeFetcher(async () => ({ status: 304, body: null }));
    await new AssetCache(store, fake.fetcher).open(ref());
    expect(fake.calls[0]?.ifNoneMatch).toBe(`"${HASH_V1}"`);
    expect(store.writeCount).toBe(writesAfterFirst);
  });
});
