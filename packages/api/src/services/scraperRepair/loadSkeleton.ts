import { Readable } from 'node:stream';
import type { Db } from 'mongodb';
import { RunSkeletonRepository } from '../runSkeletons/RunSkeletonRepository';
import { decryptRunSkeleton } from '../runSkeletons/runSkeletonCipher';
import type { IAssetStore } from '../assets/IAssetStore';

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function loadSkeletonByHash(params: {
  readonly database: Db;
  readonly assetStore: IAssetStore;
  readonly step: string;
  readonly skeletonHash: string;
}): Promise<string | null> {
  const coll = params.database.collection('slc_run_skeletons');
  const row = await coll
    .find({ sha256: params.skeletonHash, step: params.step })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
  if (!row) return null;
  const storageKey = row['storageKey'] as string;
  const { stream } = await params.assetStore.get(storageKey);
  const encPayload = JSON.parse(await streamToString(stream)) as { encrypted: string; iv: string };
  const plain = decryptRunSkeleton(encPayload);
  if (!plain) return null;
  const parsed = JSON.parse(plain) as { skeleton?: string };
  return typeof parsed.skeleton === 'string' ? parsed.skeleton : null;
}

export { RunSkeletonRepository };
