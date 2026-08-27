import type { IAssetCacheStore, IStoredCachedAsset } from '@scholaracle/interfaces';

/** Injected file IO so Node tests and Expo share one store. */
export interface IAssetCacheFs {
  read(fileName: string): Promise<Uint8Array | undefined>;
  write(fileName: string, bytes: Uint8Array): Promise<void>;
  remove(fileName: string): Promise<void>;
  list(): Promise<readonly string[]>;
}

/**
 * IAssetCacheStore backed by a directory. Cache key is never the signed URL;
 * filenames are encodeURIComponent(`${assetId}:${contentHash}`).
 */
export class DirectoryAssetCacheStore implements IAssetCacheStore {
  constructor(private readonly _fs: IAssetCacheFs) {}

  public async get(key: string): Promise<IStoredCachedAsset | undefined> {
    const bytes = await this._fs.read(binName(key));
    if (bytes === undefined) return undefined;
    const typeBytes = await this._fs.read(typeName(key));
    const contentType =
      typeBytes !== undefined ? new TextDecoder().decode(typeBytes) : 'application/octet-stream';
    return { bytes, contentType };
  }

  public async set(key: string, value: IStoredCachedAsset): Promise<void> {
    await this._fs.write(binName(key), value.bytes);
    await this._fs.write(typeName(key), new TextEncoder().encode(value.contentType));
  }

  public async delete(key: string): Promise<void> {
    await this._fs.remove(binName(key));
    await this._fs.remove(typeName(key));
  }

  public async keys(): Promise<readonly string[]> {
    const names = await this._fs.list();
    return names.filter((n) => n.endsWith('.bin')).map((n) => decodeURIComponent(n.slice(0, -4)));
  }
}

function binName(key: string): string {
  return `${encodeURIComponent(key)}.bin`;
}

function typeName(key: string): string {
  return `${encodeURIComponent(key)}.type`;
}
