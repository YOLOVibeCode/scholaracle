import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthService } from '@scholaracle/auth';
import { ServedSelectorPatchRepository } from '@scholaracle/database';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';

describe('GET /api/ingest/v1/selector-patches', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let mongoServer: MongoMemoryServer;
  let connectorToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    database = mongoClient.db('selector_patches_route');

    process.env['CONNECTOR_JWT_SECRET'] = 'test-secret-connector';
    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register(
      'selector-patches@test.com',
      'password123',
      'Patches User'
    );
    if (!reg.success || !reg.token) throw new Error('register failed');
    const userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1',
      ingestV1Router({
        database,
        jwtSecret: 'test-secret',
        connectorJwtSecret: 'test-secret-connector',
      })
    );
    app.use(createErrorHandler());

    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode: start.body.userCode });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode });
    connectorToken = poll.body.connectorToken as string;
  }, 60_000);

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('served_selector_patches').deleteMany({});
    delete process.env['REMOTE_SELECTOR_PATCHES_ENABLED'];
    delete process.env['REMOTE_SELECTOR_PATCHES_KILL_SWITCH'];
  });

  it('returns empty patches when feature flag is off', async () => {
    const res = await request(app)
      .get('/api/ingest/v1/selector-patches?portalHost=district.aeries.net')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patches).toEqual([]);
    expect(res.body.flags.remoteSelectorPatches).toBe(false);
  });

  it('returns served patches when enabled', async () => {
    process.env['REMOTE_SELECTOR_PATCHES_ENABLED'] = 'true';
    const repo = new ServedSelectorPatchRepository(database);
    await repo.markServed({
      key: {
        portalHost: 'district.aeries.net',
        recipeId: 'aeries',
        step: 'aeries.gradebook.assignments',
        skeletonHash: 'c'.repeat(64),
        gapKind: 'no_assignments',
      },
      selectors: { gradebook_row_class_tableView: 'TableView' },
      proposalCreatedAt: new Date(),
    });
    const res = await request(app)
      .get('/api/ingest/v1/selector-patches?portalHost=district.aeries.net')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patches).toHaveLength(1);
  });

  it('returns no patches when kill switch is on', async () => {
    process.env['REMOTE_SELECTOR_PATCHES_ENABLED'] = 'true';
    process.env['REMOTE_SELECTOR_PATCHES_KILL_SWITCH'] = 'true';
    const repo = new ServedSelectorPatchRepository(database);
    await repo.markServed({
      key: {
        portalHost: 'district.aeries.net',
        recipeId: 'aeries',
        step: 'aeries.gradebook.assignments',
        skeletonHash: 'd'.repeat(64),
        gapKind: 'no_assignments',
      },
      selectors: {},
      proposalCreatedAt: new Date(),
    });
    const res = await request(app)
      .get('/api/ingest/v1/selector-patches?portalHost=district.aeries.net')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.body.patches).toEqual([]);
  });
});
