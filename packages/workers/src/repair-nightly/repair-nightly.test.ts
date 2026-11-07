import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { resolveLlmConfig, runScraperRepairProposal } from '@scholaracle/agents';
import { runRepairNightly } from './repair-nightly';

jest.mock('@scholaracle/agents', () => ({
  resolveLlmConfig: jest.fn(),
  runScraperRepairProposal: jest.fn(),
}));

const mockedResolveLlmConfig = resolveLlmConfig as jest.MockedFunction<typeof resolveLlmConfig>;
const mockedRunScraperRepairProposal = runScraperRepairProposal as jest.MockedFunction<
  typeof runScraperRepairProposal
>;

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
    await database.collection('repair_proposals').deleteMany({});
    process.env['LITELLM_API_KEY'] = 'e2e-test-key';
    process.env['LITELLM_API_BASE'] = 'https://relay.test';
    mockedResolveLlmConfig.mockImplementation(() => ({
      apiKey: 'k',
      baseUrl: 'https://x',
      model: 'm',
    }));
    mockedRunScraperRepairProposal.mockClear();
    mockedRunScraperRepairProposal.mockResolvedValue({ status: 'proposed' });
  });

  it('skips when LLM is not configured', async () => {
    mockedResolveLlmConfig.mockReturnValueOnce(null);
    const n = await runRepairNightly(database, {
      billingUserId: 'platform',
      loadSkeleton: async () => '{"t":"div"}',
    });
    expect(n).toBe(0);
    expect(mockedRunScraperRepairProposal).not.toHaveBeenCalled();
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
    expect(mockedRunScraperRepairProposal).not.toHaveBeenCalled();
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
    expect(mockedRunScraperRepairProposal).toHaveBeenCalledWith(
      expect.objectContaining({ skipPlanQuota: true })
    );
  });

  it('does not count proposals that are not accepted', async () => {
    await database.collection('repair_candidates').insertOne({
      portalHost: 'h.example',
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'f'.repeat(64),
      gapKind: 'no_grade_no_assignments',
      seenCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    mockedRunScraperRepairProposal.mockResolvedValueOnce({ status: 'skipped_not_real' });
    const n = await runRepairNightly(database, {
      billingUserId: 'platform',
      loadSkeleton: async () => '{"t":"div"}',
    });
    expect(n).toBe(0);
    expect(mockedRunScraperRepairProposal).toHaveBeenCalled();
  });
});
