import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { IAssetStore, IAssetMetadata } from './IAssetStore';

export interface IS3AssetStoreConfig {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * S3-compatible asset store (Railway Buckets, AWS S3, R2, B2).
 */
export class S3AssetStore implements IAssetStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: IS3AssetStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  async put(key: string, stream: Readable, metadata: IAssetMetadata): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: metadata.contentType,
        ContentLength: metadata.contentLength,
      })
    );
  }

  async get(key: string): Promise<{ stream: Readable; metadata: IAssetMetadata }> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = out.Body;
    if (!body || typeof body === 'string') {
      throw new Error('S3 GetObject returned no body');
    }
    return {
      stream: body as Readable,
      metadata: {
        contentType: out.ContentType ?? 'application/octet-stream',
        contentLength: out.ContentLength ?? 0,
      },
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
