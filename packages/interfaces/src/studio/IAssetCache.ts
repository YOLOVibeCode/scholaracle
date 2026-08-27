/**
 * Client-side asset cache. Key is assetId + contentHash — never the signed
 * downloadUrl (that is a 24h fetch ticket only).
 *
 * Distinct from the server blob store
 * `packages/api/src/services/assets/IAssetStore.ts`.
 */

export interface IAssetRef {
  readonly assetId: string;
  readonly contentHash: string;
  readonly downloadUrl?: string;
}

export interface ICachedAsset {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly cacheKey: string;
  readonly fromCache: boolean;
  readonly stale: boolean;
  /**
   * True when we could not fetch the requested hash and returned an older
   * copy for this assetId so the student can still read last week’s PDF.
   */
  readonly requestedHashMissing?: boolean;
}

export interface IStoredCachedAsset {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface IAssetFetchInit {
  readonly ifNoneMatch?: string;
}

export interface IAssetFetchResult {
  readonly status: number;
  readonly body: Uint8Array | null;
  readonly contentType?: string;
}

export interface IAssetFetcher {
  fetch(url: string, init: IAssetFetchInit): Promise<IAssetFetchResult>;
}

export interface IAssetCacheStore {
  get(key: string): Promise<IStoredCachedAsset | undefined>;
  set(key: string, value: IStoredCachedAsset): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}

/** Cache key format: `${assetId}:${contentHash}` — never the signed downloadUrl. */
export interface IAssetCache {
  open(ref: IAssetRef): Promise<ICachedAsset>;
}
