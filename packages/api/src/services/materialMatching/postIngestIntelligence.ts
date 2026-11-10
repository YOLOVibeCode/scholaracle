import type { Db } from 'mongodb';
import type { IAssetStore } from '../assets/IAssetStore';
import { hasServerAiConsent } from '../consent/serverAiConsent';
import { runBatchMaterialMatching } from './batchMaterialMatcher';
import { runVisionDescribeByContentHash } from './visionDescribeByHash';

export async function runPostIngestIntelligence(params: {
  readonly database: Db;
  readonly userId: string;
  readonly assetStore?: IAssetStore;
}): Promise<void> {
  const isAllowed = await hasServerAiConsent(params.database, params.userId);
  if (!isAllowed) {
    return;
  }
  if (params.assetStore) {
    await runVisionDescribeByContentHash({
      database: params.database,
      userId: params.userId,
      assetStore: params.assetStore,
    });
  }
  await runBatchMaterialMatching({ database: params.database, userId: params.userId });
}
