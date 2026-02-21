import type { IAssetStore } from './IAssetStore';
import type { IAssetDocument, IAssetReader, IAssetWriter } from './AssetRepository';

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface IAssetPruneServiceConfig {
  readonly assetReader: IAssetReader;
  readonly assetWriter: IAssetWriter;
  readonly assetStore: IAssetStore;
  readonly gracePeriodMs?: number;
}

/**
 * Two-phase pruning: soft delete (deletedAt) then hard delete after grace period.
 * Term-based: delete assets for an ended academic term.
 * Source-based: delete all assets for a disconnected source.
 * Age-based: delete assets older than threshold with no recent access.
 */
export class AssetPruneService {
  private readonly reader: IAssetReader;
  private readonly writer: IAssetWriter;
  private readonly store: IAssetStore;
  private readonly gracePeriodMs: number;

  constructor(config: IAssetPruneServiceConfig) {
    this.reader = config.assetReader;
    this.writer = config.assetWriter;
    this.store = config.assetStore;
    this.gracePeriodMs = config.gracePeriodMs ?? GRACE_PERIOD_MS;
  }

  /**
   * Soft-delete all assets for the given source (e.g. when user disconnects scraper).
   */
  async pruneBySource(userId: string, sourceId: string): Promise<number> {
    return this.writer.softDeleteBySourceId(userId, sourceId);
  }

  /**
   * Soft-delete all assets for the given academic term (e.g. end of semester).
   */
  async pruneByTerm(userId: string, sourceId: string, academicTermId: string): Promise<number> {
    return this.writer.softDeleteByTerm(userId, sourceId, academicTermId);
  }

  /**
   * Soft-delete assets that were soft-deleted before (now - gracePeriod) so they can be hard-deleted.
   * Returns list of assetIds that were eligible for hard delete.
   */
  async processGracePeriod(): Promise<{ hardDeleted: number; errors: string[] }> {
    const cutoff = new Date(Date.now() - this.gracePeriodMs);
    const list = await this.reader.findSoftDeletedBefore(cutoff);
    let hardDeleted = 0;
    const errors: string[] = [];
    for (const asset of list as IAssetDocument[]) {
      try {
        await this.store.delete(asset.storageKey);
        await this.writer.hardDelete(asset.assetId);
        hardDeleted++;
      } catch (e) {
        errors.push(`${asset.assetId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { hardDeleted, errors };
  }

  /**
   * Age-based: soft-delete assets older than maxAgeMs with lastAccessedAt older than maxIdleMs.
   * Optional; call from a scheduled job. Does not hard-delete (use processGracePeriod for that).
   */
  async pruneByAge(
    userId: string,
    sourceId: string,
    maxAgeMs: number,
    maxIdleMs: number
  ): Promise<number> {
    const uploadedBefore = new Date(Date.now() - maxAgeMs);
    const lastAccessedBefore = new Date(Date.now() - maxIdleMs);
    return this.writer.softDeleteByAge(userId, sourceId, uploadedBefore, lastAccessedBefore);
  }
}
