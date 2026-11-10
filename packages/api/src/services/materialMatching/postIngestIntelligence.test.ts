import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SERVER_AI_CONSENT_PURPOSE, SERVER_AI_CONSENT_TEXT_VERSION } from '@scholaracle/contracts';
import { ServerAiConsentRepository } from '@scholaracle/database';
import { runPostIngestIntelligence } from './postIngestIntelligence';
import * as visionModule from './visionDescribeByHash';
import * as batchModule from './batchMaterialMatcher';

describe('runPostIngestIntelligence consent gate', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let visionSpy: jest.SpyInstance;
  let batchSpy: jest.SpyInstance;
  const userId = 'owner-user-1';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('post_ingest_intel_test');
    const repo = new ServerAiConsentRepository(database);
    await repo.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('consents').deleteMany({});
    visionSpy = jest
      .spyOn(visionModule, 'runVisionDescribeByContentHash')
      .mockResolvedValue({ describeCallCount: 0 });
    batchSpy = jest
      .spyOn(batchModule, 'runBatchMaterialMatching')
      .mockResolvedValue({ llmCallCount: 0, matchedCount: 0 });
  });

  afterEach(() => {
    visionSpy.mockRestore();
    batchSpy.mockRestore();
  });

  it('skips matching and vision without consent', async () => {
    await runPostIngestIntelligence({
      database,
      userId,
      assetStore: {} as never,
    });
    expect(visionSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();
  });

  it('runs matching and vision when consent is recorded', async () => {
    const repo = new ServerAiConsentRepository(database);
    await repo.recordOptIn({
      userId,
      purpose: SERVER_AI_CONSENT_PURPOSE,
      consentTextVersion: SERVER_AI_CONSENT_TEXT_VERSION,
      source: 'jest',
    });

    await runPostIngestIntelligence({
      database,
      userId,
      assetStore: {} as never,
    });
    expect(visionSpy).toHaveBeenCalled();
    expect(batchSpy).toHaveBeenCalled();
  });
});
