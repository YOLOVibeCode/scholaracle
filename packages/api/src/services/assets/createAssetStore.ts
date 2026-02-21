import { join } from 'node:path';
import type { IAssetStore } from './IAssetStore';
import { LocalAssetStore } from './LocalAssetStore';
import { S3AssetStore } from './S3AssetStore';

/**
 * Create IAssetStore from env. ASSET_STORE=local (default) | s3.
 * Local: ASSET_STORAGE_PATH (default ./data/assets).
 * S3: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET; optional AWS_S3_ENDPOINT (e.g. https://storage.railway.app).
 */
export function createAssetStore(): IAssetStore {
  const kind = process.env['ASSET_STORE'] ?? 'local';
  if (kind === 's3') {
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    const region = process.env['AWS_REGION'];
    const bucket = process.env['AWS_S3_BUCKET'];
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      throw new Error(
        'ASSET_STORE=s3 requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET'
      );
    }
    return new S3AssetStore({
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
      endpoint: process.env['AWS_S3_ENDPOINT'] ?? undefined,
    });
  }
  const path =
    process.env['ASSET_STORAGE_PATH'] ?? join(process.cwd(), 'data', 'assets');
  return new LocalAssetStore(path);
}
