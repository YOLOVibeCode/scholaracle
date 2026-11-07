import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { AiBudgetError, ERROR_CODES } from '@scholaracle/contracts';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { seedBindingsForEnvelope } from '../../../test-utils/seedIngestBinding';

const mockRunPostIngest = jest.fn();

jest.mock('../../../services/materialMatching/postIngestIntelligence', () => ({
  runPostIngestIntelligence: (...args: unknown[]) => mockRunPostIngest(...args),
}));

describe('Ingest complete surfaces AI_BUDGET when post-ingest LLM budget is hit', () => {
  let mongod: MongoMemoryServer;
  let mongoClient: MongoClient;
  let database: Db;
  let app: Express;
  let userToken: string;
  let ownerUserId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongod.getUri());
    await mongoClient.connect();
    database = mongoClient.db('post_ingest_budget_test');
    process.env['CONNECTOR_JWT_SECRET'] = 'test-secret-connector-budget';
    const authService = new AuthService(database, 'test-secret-budget');
    const reg = await authService.register('budget-user@test.com', 'password123', 'Budget User');
    if (!reg.success || !reg.token || !reg.user?.id) throw new Error('register failed');
    userToken = reg.token;
    ownerUserId = reg.user.id;

    app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1',
      ingestV1Router({
        database,
        jwtSecret: 'test-secret-budget',
        connectorJwtSecret: 'test-secret-connector-budget',
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongod.stop();
  });

  it('returns committed sync with codes AI_BUDGET when relay returns budget error', async () => {
    mockRunPostIngest.mockRejectedValue(new AiBudgetError());

    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode: start.body.userCode as string });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode as string });
    const connectorToken = poll.body.connectorToken as string;

    const sourceId = 'src-budget';
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Test',
      });
    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId });
    const runId = runRes.body.runId as string;
    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId,
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Test',
      },
      ops: [],
    };
    await seedBindingsForEnvelope(database, ownerUserId, envelope);
    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);

    const complete = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ cursor: { type: 'opaque', value: 'c1' } });

    expect(complete.status).toBe(200);
    expect(complete.body.committed).toBe(true);
    expect(complete.body.codes).toEqual([ERROR_CODES.AI_BUDGET]);
  });
});
