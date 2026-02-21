import type { Readable } from 'node:stream';

export interface IAssetMetadata {
  readonly contentType: string;
  readonly contentLength: number;
}

export interface IAssetStore {
  put(key: string, stream: Readable, metadata: IAssetMetadata): Promise<void>;
  get(key: string): Promise<{ stream: Readable; metadata: IAssetMetadata }>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
