import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from 'mongodb';
import type { IRepairNightlyDeps } from './repair-nightly';
import { decryptRunSkeleton } from './runSkeletonCipher';

export function buildWorkerRepairDeps(database: Db, billingUserId: string): IRepairNightlyDeps {
  const assetRoot = process.env['ASSET_STORAGE_PATH'] ?? join(process.cwd(), 'data', 'assets');
  return {
    billingUserId,
    loadSkeleton: async ({ step, skeletonHash }): Promise<string | null> => {
      const coll = database.collection('slc_run_skeletons');
      const row = await coll
        .find({ sha256: skeletonHash, step })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      if (!row) return null;
      const storageKey = row['storageKey'] as string;
      const raw = await readFile(join(assetRoot, storageKey), 'utf8');
      const encPayload = JSON.parse(raw) as { encrypted: string; iv: string };
      const plain = decryptRunSkeleton(encPayload);
      if (!plain) return null;
      const parsed = JSON.parse(plain) as { skeleton?: string };
      return typeof parsed.skeleton === 'string' ? parsed.skeleton : null;
    },
  };
}
