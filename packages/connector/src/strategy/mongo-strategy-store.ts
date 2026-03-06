/* eslint-disable @typescript-eslint/naming-convention */
/**
 * MongoDB-backed strategy store for Railway workers.
 */

import type { Db } from 'mongodb';
import type { IExtractionStrategy, IStrategyStore } from './types';

const COLLECTION = 'slc_scraper_strategies';

export class MongoStrategyStore implements IStrategyStore {
  private readonly _db: Db;

  constructor(db: Db) {
    this._db = db;
  }

  async get(extractionId: string): Promise<IExtractionStrategy | null> {
    const doc = await this._db
      .collection(COLLECTION)
      .findOne<Record<string, unknown>>({ extractionId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    const strategy = rest as unknown as IExtractionStrategy;
    if (
      typeof strategy.extractionId !== 'string' ||
      typeof strategy.platform !== 'string' ||
      !Array.isArray(strategy.selectors)
    ) {
      return null;
    }
    return strategy;
  }

  async save(strategy: IExtractionStrategy): Promise<void> {
    const now = new Date().toISOString();
    const doc = { ...strategy, updatedAt: now };
    await this._db
      .collection(COLLECTION)
      .updateOne({ extractionId: strategy.extractionId }, { $set: doc }, { upsert: true });
  }

  async invalidate(extractionId: string): Promise<void> {
    await this._db.collection(COLLECTION).deleteOne({ extractionId });
  }
}
