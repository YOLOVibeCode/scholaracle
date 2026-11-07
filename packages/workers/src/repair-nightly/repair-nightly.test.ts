import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { runRepairNightly } from './repair-nightly';

jest.mock('@scholaracle/agents', () => ({
  resolveLlmConfig: jest.fn(() => ({ apiKey: 'k', baseUrl: 'https://x', model: 'm' })),
  runScraperRepairProposal: jest.fn().mockResolvedValue({ status: 'proposed' }),
}));

describe('runRepairNightly', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('repair_nightly');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await database.collection('repair_candidates').deleteMany({});
    const { runScraperRepairProposal } = jest.requireMock('@scholaracle/agents');
    runScraperRepairProposal.mockClear();
  });

  it('skips when skeleton cannot be loaded', async () => {
    await database.collection('repair_candidates').insertOne({
      portalHost: 'h.example',
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'd'.repeat(64),
      gapKind: 'no_grade_no_assignments',
      seenCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const n = await runRepairNightly(database, {
      billingUserId: 'platform',
      loadSkeleton: async () => null,
    });
    expect(n).toBe(0);
    const { runScraperRepairProposal } = jest.requireMock('@scholaracle/agents');
    expect(runScraperRepairProposal).not.toHaveBeenCalled();
  });

  it('invokes repair when skeleton is present', async () => {
    await database.collection('repair_candidates').insertOne({
      portalHost: 'h.example',
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'e'.repeat(64),
      gapKind: 'no_grade_no_assignments',
      seenCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const n = await runRepairNightly(database, {
      billingUserId: 'platform',
      loadSkeleton: async () => '{"t":"div"}',
    });
    expect(n).toBe(1);
    const { runScraperRepairProposal } = jest.requireMock('@scholaracle/agents');
    expect(runScraperRepairProposal).toHaveBeenCalledWith(
      expect.objectContaining({ skipPlanQuota: true })
    );
  });
});
