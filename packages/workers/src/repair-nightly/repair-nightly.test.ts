import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { AiRole, runScraperRepairProposal, resolveLlmConfig } from '@scholaracle/agents';
import { runRepairNightly } from './repair-nightly';

describe('runRepairNightly', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let mockResolveLlm: jest.MockedFunction<typeof resolveLlmConfig>;
  let mockRunProposal: jest.MockedFunction<typeof runScraperRepairProposal>;

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
    mockResolveLlm = jest.fn((_role: AiRole) => ({
      apiKey: 'k',
      baseUrl: 'https://x',
      model: 'm',
    }));
    mockRunProposal = jest.fn().mockResolvedValue({
      status: 'proposed',
      patch: { selectors: { row: '.grade-row' } },
    });
  });

  const baseDeps = () => ({
    billingUserId: 'platform',
    loadSkeleton: async () => '{"t":"div"}',
    resolveLlmConfigFn: mockResolveLlm,
    runScraperRepairProposalFn: mockRunProposal,
  });

  it('skips when LLM is not configured', async () => {
    mockResolveLlm.mockReturnValueOnce(null);
    const n = await runRepairNightly(database, baseDeps());
    expect(n).toBe(0);
    expect(mockRunProposal).not.toHaveBeenCalled();
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
      ...baseDeps(),
      loadSkeleton: async () => null,
    });
    expect(n).toBe(0);
    expect(mockRunProposal).not.toHaveBeenCalled();
  });

  it('invokes verifyAndServe after a proposal when configured', async () => {
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
    const verifyAndServe = jest.fn().mockResolvedValue('served');
    await runRepairNightly(database, {
      ...baseDeps(),
      verifyAndServe,
    });
    expect(verifyAndServe).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'aeries.gradebook.assignments' }),
      { row: '.grade-row' }
    );
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
    const n = await runRepairNightly(database, baseDeps());
    expect(n).toBe(1);
    expect(mockRunProposal).toHaveBeenCalledWith(expect.objectContaining({ skipPlanQuota: true }));
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
    mockRunProposal.mockResolvedValueOnce({ status: 'skipped_not_real' });
    const n = await runRepairNightly(database, baseDeps());
    expect(n).toBe(0);
    expect(mockRunProposal).toHaveBeenCalled();
  });
});
