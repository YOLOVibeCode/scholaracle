import express, { type Express } from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createScrapersRepairRouter } from './repair';
import { createErrorHandler } from '../../middleware/errorHandler';
import { createTestAdmin } from '../../test-utils/admin-test-helper';

const mockRun = jest.fn();

jest.mock('@scholaracle/agents', () => {
  const actual = jest.requireActual('@scholaracle/agents');
  return {
    ...actual,
    runScraperRepairProposal: (...args: unknown[]) => mockRun(...args),
  };
});

describe('POST /api/scrapers/repair', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let adminToken: string;

  const validBody = {
    portalHost: 'district.aeries.net',
    recipeId: 'aeries',
    step: 'aeries.gradebook.assignments',
    skeletonHash: 'c'.repeat(64),
    gapKind: 'no_grade_no_assignments',
    skeleton: '{"t":"div"}',
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('scrapers_repair_route');
    app = express();
    app.use(
      '/api/scrapers',
      createScrapersRepairRouter({ database, jwtSecret: 'test-secret-minimum-32-chars-long' })
    );
    app.use(createErrorHandler());
    const admin = await createTestAdmin(database, 'test-secret-minimum-32-chars-long', {
      email: 'repair-admin@test.com',
      password: 'AdminPass123!',
      name: 'Repair Admin',
      role: 'admin',
    });
    adminToken = admin.token;
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(() => {
    mockRun.mockReset();
    mockRun.mockResolvedValue({
      status: 'proposed',
      patch: {
        step: validBody.step,
        selectors: { x: '.y' },
        confidence: 0.9,
      },
    });
  });

  it('rejects 401 without admin token', async () => {
    const res = await request(app).post('/api/scrapers/repair').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects a body larger than 200 KB with 413', async () => {
    const huge = 'x'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/scrapers/repair')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBody, skeleton: huge });
    expect(res.status).toBe(413);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('accepts a valid repair request', async () => {
    const res = await request(app)
      .post('/api/scrapers/repair')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRun).toHaveBeenCalled();
  });
});
