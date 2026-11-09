import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createAdminAiRouter } from './ai';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { AiUsageRepository } from '@scholaracle/database';

const JWT_SECRET = 'admin-ai-test-secret-min-32-chars!!';

describe('GET /api/admin/ai/usage-summary', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: express.Express;
  let adminToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('admin_ai_test');
    app = express();
    app.use('/api/admin/ai', createAdminAiRouter({ database, jwtSecret: JWT_SECRET }));
    app.use(createErrorHandler());
    const admin = await createTestAdmin(database, JWT_SECRET, {
      email: 'admin-ai@test.com',
      password: 'TestAdmin123!',
      name: 'Admin AI',
      role: 'admin',
    });
    adminToken = admin.token;
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await database.collection('ai_usage').deleteMany({});
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/ai/usage-summary');
    expect(res.status).toBe(401);
  });

  it('returns totals that match ai_usage sums', async () => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const repo = new AiUsageRepository(database);
    await repo.recordCost({
      userId: 'bill',
      feature: 'scraper_repair',
      at: new Date(monthStart.getTime() + 60_000),
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.00013,
      repairCandidateId: 'district.test.edu|aeries|step|abc|no_grade',
    });
    await repo.recordCost({
      userId: 'bill',
      feature: 'scraper_repair',
      at: new Date(monthStart.getTime() + 120_000),
      model: 'm',
      inputTokens: 20,
      outputTokens: 10,
      costUsd: 0.00026,
      repairCandidateId: 'district.test.edu|aeries|step|abc|no_grade',
    });

    const res = await request(app)
      .get('/api/admin/ai/usage-summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.monthToDateSpendUsd).toBe(0.00039);
    expect(res.body.data.verificationPassRate).toBe(1);
    expect(res.body.data.repairsByDistrict).toEqual([
      { portalHost: 'district.test.edu', repairCount: 1 },
    ]);
  });
});
