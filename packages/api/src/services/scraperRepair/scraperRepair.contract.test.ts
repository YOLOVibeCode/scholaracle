import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import type { LlmClient } from '@scholaracle/agents';
import { buildRepairPromptPrefix, runScraperRepairProposal } from '@scholaracle/agents';
import { checkAiRateLimit, AI_RATE_LIMITS } from '../ai-rate-limit';
import type { ScraperRepairQuotaResult } from '@scholaracle/agents';

const mockTriageComplete = jest.fn();
const mockPatchComplete = jest.fn();

function makeMockClients(): { triage: LlmClient; patch: LlmClient } {
  const triage = {
    model: 'claude-haiku-mock',
    complete: mockTriageComplete,
    lastSystemPrompt: '',
  } as unknown as LlmClient;
  const patch = {
    model: 'claude-sonnet-mock',
    complete: mockPatchComplete,
    lastSystemPrompt: '',
  } as unknown as LlmClient;
  return { triage, patch };
}

describe('ScraperRepair contract (mocked relay)', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  const candidateKey = {
    portalHost: 'district.aeries.net',
    recipeId: 'aeries',
    step: 'aeries.gradebook.assignments',
    skeletonHash: 'a'.repeat(64),
    gapKind: 'no_grade_no_assignments' as const,
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('scraper_repair_contract');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await database.collection('ai_usage').deleteMany({});
    await database.collection('repair_proposals').deleteMany({});
    mockTriageComplete.mockReset();
    mockPatchComplete.mockReset();
    mockTriageComplete.mockResolvedValue({
      content: '{"real":true,"step":"aeries.gradebook.assignments"}',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    mockPatchComplete.mockResolvedValue({
      content:
        '{"step":"aeries.gradebook.assignments","selectors":{"dashboard_class_cards":".Card"},"confidence":0.9,"notes":"ok"}',
      usage: { inputTokens: 200, outputTokens: 40 },
    });
  });

  it('uses identical patch system prefix across two proposals', async () => {
    const capturedSystems: string[] = [];
    mockPatchComplete.mockImplementation(async (_msgs: unknown, opts?: { system?: string }) => {
      if (opts?.system) capturedSystems.push(opts.system);
      return {
        content:
          '{"step":"aeries.gradebook.assignments","selectors":{"dashboard_class_cards":".x"},"confidence":0.8}',
        usage: { inputTokens: 50, outputTokens: 10 },
      };
    });

    const prefix = buildRepairPromptPrefix({
      recipeId: 'aeries',
      step: candidateKey.step,
      selectorTableJson: '{"version":1,"selectors":{}}',
    });
    expect(prefix).toContain('Recipe: aeries');

    const checkQuota = async (): Promise<ScraperRepairQuotaResult> => ({ ok: true });
    const { triage, patch } = makeMockClients();
    for (let i = 0; i < 2; i++) {
      await runScraperRepairProposal({
        database,
        key: { ...candidateKey, skeletonHash: `${i}`.repeat(64) },
        skeleton: '{"t":"div","ch":[]}',
        selectorTableJson: '{"version":1,"selectors":{}}',
        billingUserId: 'bill-user',
        skipPlanQuota: true,
        checkPlanQuota: checkQuota,
        triageClient: triage,
        patchClient: patch,
      });
    }
    expect(capturedSystems).toHaveLength(2);
    expect(capturedSystems[0]).toBe(capturedSystems[1]);
  });

  it('returns quota_exceeded without recording ai_usage when plan cap hit', async () => {
    await database.collection('subscriptions').deleteMany({});
    await database.collection('subscriptions').insertOne({
      userId: 'quota-user',
      plan: 'free',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });
    const quota = await checkAiRateLimit(database, 'quota-user', 'scraper_repair');
    expect(quota.allowed).toBe(false);
    expect(quota.limit).toBe(AI_RATE_LIMITS.free.scraper_repair);

    const { triage, patch } = makeMockClients();
    const result = await runScraperRepairProposal({
      database,
      key: candidateKey,
      skeleton: '<redacted>',
      selectorTableJson: '{}',
      billingUserId: 'quota-user',
      triageClient: triage,
      patchClient: patch,
      checkPlanQuota: async (db, userId) => {
        const r = await checkAiRateLimit(db, userId, 'scraper_repair');
        if (!r.allowed) {
          return { ok: false, status: 429, message: 'cap' };
        }
        return { ok: true };
      },
    });
    expect(result.status).toBe('quota_exceeded');
    expect(mockTriageComplete).not.toHaveBeenCalled();
    const usageCount = await database.collection('ai_usage').countDocuments({
      feature: 'scraper_repair',
    });
    expect(usageCount).toBe(0);
  });

  it('writes ai_usage cost rows per LLM call', async () => {
    const { triage, patch } = makeMockClients();
    await runScraperRepairProposal({
      database,
      key: candidateKey,
      skeleton: '{"t":"main"}',
      selectorTableJson: '{"version":1,"selectors":{}}',
      billingUserId: 'cost-user',
      skipPlanQuota: true,
      triageClient: triage,
      patchClient: patch,
    });
    const rows = await database
      .collection('ai_usage')
      .find({ feature: 'scraper_repair', userId: 'cost-user' })
      .toArray();
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row['model']).toBeTruthy();
      expect(typeof row['inputTokens']).toBe('number');
      expect(typeof row['outputTokens']).toBe('number');
      expect(typeof row['costUsd']).toBe('number');
      expect(row['repairCandidateId']).toContain(candidateKey.portalHost);
    }
  });
});
