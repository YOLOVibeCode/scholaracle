import type { Db, Collection } from 'mongodb';
import type { ObjectId } from 'mongodb';

export type AiFeature = 'scraper_generation' | 'grade_risk' | 'agenda';

export interface IAiUsageRecord {
  readonly userId: string;
  readonly feature: AiFeature;
  readonly at: Date;
}

const COLLECTION_NAME = 'ai_usage';

/**
 * Tracks per-user AI feature usage for rate limiting by plan tier.
 */
export class AiUsageRepository {
  private readonly _collection: Collection<IAiUsageRecord & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IAiUsageRecord & { _id?: ObjectId }>(COLLECTION_NAME);
  }

  /** Record one usage event. */
  async record(userId: string, feature: AiFeature, at: Date = new Date()): Promise<void> {
    await this._collection.insertOne({ userId, feature, at });
  }

  /** Count usage in a time window (at >= windowStart). */
  async countInWindow(userId: string, feature: AiFeature, windowStart: Date): Promise<number> {
    const n = await this._collection.countDocuments({
      userId,
      feature,
      at: { $gte: windowStart },
    });
    return n;
  }
}
