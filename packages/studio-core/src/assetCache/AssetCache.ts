import type {
  IAssetCache,
  IAssetCacheStore,
  IAssetFetcher,
  IAssetRef,
  ICachedAsset,
} from '@scholaracle/interfaces';
import { AssetCacheError } from './AssetCacheError';

/** Cache key format: `${assetId}:${contentHash}` — never the signed downloadUrl. */
export function assetCacheKey(assetId: string, contentHash: string): string {
  return `${assetId}:${contentHash}`;
}

function prefix(assetId: string): string {
  return `${assetId}:`;
}

/**
 * Client asset cache. Bytes keyed by assetId + contentHash.
 * downloadUrl is a fetch ticket only.
 */
export class AssetCache implements IAssetCache {
  private readonly _store: IAssetCacheStore;
  private readonly _fetcher: IAssetFetcher;

  constructor(store: IAssetCacheStore, fetcher: IAssetFetcher) {
    this._store = store;
    this._fetcher = fetcher;
  }

  public async open(ref: IAssetRef): Promise<ICachedAsset> {
    const key = assetCacheKey(ref.assetId, ref.contentHash);
    const hit = await this._store.get(key);
    if (hit) {
      return this._revalidate(ref, key, hit);
    }
    return this._fetchOrStale(ref, key);
  }

  private async _revalidate(
    ref: IAssetRef,
    key: string,
    hit: { bytes: Uint8Array; contentType: string }
  ): Promise<ICachedAsset> {
    const url = ref.downloadUrl;
    if (url == null || url === '') {
      return {
        bytes: hit.bytes,
        contentType: hit.contentType,
        cacheKey: key,
        fromCache: true,
        stale: false,
      };
    }
    try {
      const res = await this._fetcher.fetch(url, { ifNoneMatch: `"${ref.contentHash}"` });
      if (res.status === 200 && res.body != null) {
        const contentType = res.contentType ?? hit.contentType;
        await this._store.set(key, { bytes: res.body, contentType });
        return {
          bytes: res.body,
          contentType,
          cacheKey: key,
          fromCache: false,
          stale: false,
        };
      }
      return {
        bytes: hit.bytes,
        contentType: hit.contentType,
        cacheKey: key,
        fromCache: true,
        stale: false,
      };
    } catch {
      return {
        bytes: hit.bytes,
        contentType: hit.contentType,
        cacheKey: key,
        fromCache: true,
        stale: false,
      };
    }
  }

  private async _fetchOrStale(ref: IAssetRef, key: string): Promise<ICachedAsset> {
    const oldKeys = (await this._store.keys()).filter(
      (k) => k.startsWith(prefix(ref.assetId)) && k !== key
    );
    const url = ref.downloadUrl;
    if (url == null || url === '') {
      return this._staleOrThrow(oldKeys, 'MISSING_URL', 'No downloadUrl and no cached copy');
    }
    try {
      const res = await this._fetcher.fetch(url, {});
      if (res.status >= 200 && res.status < 300 && res.body != null) {
        const contentType = res.contentType ?? 'application/octet-stream';
        await this._store.set(key, { bytes: res.body, contentType });
        for (const old of oldKeys) {
          await this._store.delete(old);
        }
        return {
          bytes: res.body,
          contentType,
          cacheKey: key,
          fromCache: false,
          stale: false,
        };
      }
      throw new AssetCacheError('NETWORK', `Unexpected status ${res.status}`);
    } catch (err) {
      if (oldKeys.length > 0) {
        return this._staleOrThrow(oldKeys, 'NETWORK', 'Network down');
      }
      if (err instanceof AssetCacheError) throw err;
      throw new AssetCacheError('NETWORK', 'Network down and no cached copy');
    }
  }

  private async _staleOrThrow(
    oldKeys: readonly string[],
    code: 'NETWORK' | 'NOT_IN_CACHE' | 'MISSING_URL',
    message: string
  ): Promise<ICachedAsset> {
    const oldKey = oldKeys[0];
    if (oldKey !== undefined) {
      const old = await this._store.get(oldKey);
      if (old) {
        return {
          bytes: old.bytes,
          contentType: old.contentType,
          cacheKey: oldKey,
          fromCache: true,
          stale: true,
          requestedHashMissing: true,
        };
      }
    }
    throw new AssetCacheError(code, message);
  }
}
