import type { Db, Collection } from 'mongodb';
import type { ObjectId } from 'mongodb';

export type AiFeature = 'scraper_generation' | 'grade_risk' | 'agenda' | 'scraper_repair';

export interface IAiUsageRecord {
  readonly userId: string;
  readonly feature: AiFeature;
  readonly at: Date;
}

export interface IAiUsageCostRecord extends IAiUsageRecord {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly repairCandidateId?: string;
}

import { summarizeAiUsageForAdmin, type IAiUsageAdminSummary } from './aiUsageAdminSummary';

const COLLECTION_NAME = 'ai_usage';

export type { IAiUsageAdminSummary, IAiUsageDistrictRepairCount } from './aiUsageAdminSummary';

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

  /** M3-05: usage row with model, tokens, and cost for scraper repair. */
  async recordCost(record: IAiUsageCostRecord): Promise<void> {
    await this._collection.insertOne(record);
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

  /** Month-to-date spend and scraper-repair stats for the admin dashboard. */
  async getAdminCostSummary(monthStartUtc: Date): Promise<IAiUsageAdminSummary> {
    const rows = await this._collection
      .find({ at: { $gte: monthStartUtc } })
      .project({ feature: 1, at: 1, costUsd: 1, repairCandidateId: 1 })
      .toArray();
    return summarizeAiUsageForAdmin(rows, monthStartUtc);
  }
}
