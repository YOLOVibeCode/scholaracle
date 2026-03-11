import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, unlink, access } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import type { IAssetStore, IAssetMetadata } from './IAssetStore';

/**
 * Filesystem-backed asset store for development. Keys are stored as filenames under baseDir.
 */
export class LocalAssetStore implements IAssetStore {
  constructor(private readonly baseDir: string) {}

  async put(key: string, stream: Readable, _metadata: IAssetMetadata): Promise<void> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    const dest = createWriteStream(filePath);
    await pipeline(stream, dest);
  }

  async get(key: string): Promise<{ stream: Readable; metadata: IAssetMetadata }> {
    const path = join(this.baseDir, key);
    await access(path);
    const stream = createReadStream(path);
    return {
      stream,
      metadata: { contentType: 'application/octet-stream', contentLength: 0 },
    };
  }

  async delete(key: string): Promise<void> {
    const path = join(this.baseDir, key);
    try {
      await unlink(path);
    } catch {
      // ignore if already missing
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = join(this.baseDir, key);
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(_key: string, _expiresInSeconds: number): Promise<string> {
    throw new Error('Signed URLs not supported for local store');
  }
}
