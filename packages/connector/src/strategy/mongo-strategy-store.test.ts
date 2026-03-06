/**
 * MongoStrategyStore tests with mock Db.
 */

import type { Db } from 'mongodb';
import { MongoStrategyStore } from './mongo-strategy-store';
import type { IExtractionStrategy } from './types';

function makeStrategy(overrides?: Partial<IExtractionStrategy>): IExtractionStrategy {
  const now = new Date().toISOString();
  return {
    extractionId: 'skyward:gradebook:courses',
    platform: 'skyward',
    selectors: [{ type: 'regex', value: 'classDesc_(\\d+)' }],
    version: 1,
    createdAt: now,
    updatedAt: now,
    successCount: 1,
    failCount: 0,
    ...overrides,
  };
}

function createMockDb(): Db {
  const store = new Map<string, IExtractionStrategy>();
  const col = {
    findOne: jest.fn().mockImplementation(async (filter: { extractionId?: string }) => {
      const id = filter?.extractionId;
      if (!id) return null;
      const s = store.get(id);
      return s ? { ...s, _id: id } : null;
    }),
    updateOne: jest
      .fn()
      .mockImplementation(
        async (filter: { extractionId?: string }, update: { $set: IExtractionStrategy }) => {
          const id = filter?.extractionId ?? (update.$set as IExtractionStrategy).extractionId;
          store.set(id, update.$set as IExtractionStrategy);
        }
      ),
    deleteOne: jest.fn().mockImplementation(async (filter: { extractionId?: string }) => {
      const id = filter?.extractionId;
      if (id) store.delete(id);
    }),
  };
  return { collection: jest.fn().mockReturnValue(col) } as unknown as Db;
}

describe('MongoStrategyStore', () => {
  it('get returns null for missing extractionId', async () => {
    const db = createMockDb();
    const store = new MongoStrategyStore(db);
    expect(await store.get('nonexistent:id')).toBeNull();
  });

  it('save and get round-trip', async () => {
    const db = createMockDb();
    const store = new MongoStrategyStore(db);
    const strategy = makeStrategy({ extractionId: 'roundtrip:test' });
    await store.save(strategy);
    const got = await store.get('roundtrip:test');
    expect(got).toEqual(strategy);
  });

  it('invalidate removes strategy', async () => {
    const db = createMockDb();
    const store = new MongoStrategyStore(db);
    const strategy = makeStrategy({ extractionId: 'to:invalidate' });
    await store.save(strategy);
    expect(await store.get('to:invalidate')).toEqual(strategy);
    await store.invalidate('to:invalidate');
    expect(await store.get('to:invalidate')).toBeNull();
  });
});
