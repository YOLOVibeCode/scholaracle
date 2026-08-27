import type { IAssetCacheStore, IStoredCachedAsset } from '@scholaracle/interfaces';

/** In-memory IAssetCacheStore for tests and Node fakes. */
export class MemoryAssetCacheStore implements IAssetCacheStore {
  private readonly _map = new Map<string, IStoredCachedAsset>();
  public writeCount = 0;

  public async get(key: string): Promise<IStoredCachedAsset | undefined> {
    return this._map.get(key);
  }

  public async set(key: string, value: IStoredCachedAsset): Promise<void> {
    this._map.set(key, value);
    this.writeCount += 1;
  }

  public async delete(key: string): Promise<void> {
    this._map.delete(key);
  }

  public async keys(): Promise<readonly string[]> {
    return [...this._map.keys()];
  }
}
