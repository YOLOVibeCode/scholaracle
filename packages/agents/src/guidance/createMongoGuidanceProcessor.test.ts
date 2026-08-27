import { createMongoGuidanceProcessor } from './createMongoGuidanceProcessor';
import type { IJob } from '../queue/MongoQueue';
import type { ObjectId } from 'mongodb';

describe('createMongoGuidanceProcessor', () => {
  it('returns a function that evaluates a guidance job against Mongo adapters', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const updateOne = jest.fn().mockResolvedValue({});
    const database = {
      collection: jest.fn().mockReturnValue({ findOne, updateOne }),
    } as unknown as import('mongodb').Db;
    const sink = { send: jest.fn().mockResolvedValue(undefined) };
    const process = createMongoGuidanceProcessor(database, sink);
    const job = {
      _id: { toString: () => 'j1' } as ObjectId,
      type: 'guidance',
      name: 't48h',
      data: {
        studentId: '000000000000000000000001',
        assignmentExternalId: 'a5',
        title: 'Cell Division',
        dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        timezone: 'America/New_York',
        step: 't48h',
      },
      scheduledFor: new Date(),
      priority: 10,
      status: 'pending' as const,
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as IJob;
    await expect(process(job)).resolves.toBeUndefined();
  });
});
