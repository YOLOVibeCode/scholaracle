import type { IWorkPackView } from '@scholaracle/contracts';
import type { IAssetCache, ICachedAsset } from '@scholaracle/interfaces';

export interface IOpenWorkPackPrimaryResult {
  readonly opened: boolean;
  readonly fromCache: boolean;
  readonly cacheKey?: string;
}

/**
 * Student pack Open: cache bytes by assetId+hash, present, then PATCH working_on_it.
 * Signed downloadUrl is a fetch ticket, never the cache key.
 */
export async function openWorkPackPrimary(params: {
  readonly assignmentExternalId: string;
  readonly pack: IWorkPackView;
  readonly cache: Pick<IAssetCache, 'open'>;
  readonly patchStatus: (assignmentExternalId: string, status: 'working_on_it') => Promise<void>;
  readonly present: (opened: ICachedAsset) => Promise<void>;
}): Promise<IOpenWorkPackPrimaryResult> {
  const asset = params.pack.primaryAsset;
  if (asset == null) {
    return { opened: false, fromCache: false };
  }
  const opened = await params.cache.open(asset);
  await params.present(opened);
  await params.patchStatus(params.assignmentExternalId, 'working_on_it');
  return {
    opened: true,
    fromCache: opened.fromCache,
    cacheKey: opened.cacheKey,
  };
}
