import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { authMiddleware } from '../../../middleware/auth';
import { requireParent } from '../../../middleware/requireRole';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { ingestV1Router } from './ingest';
import { studentsRouter } from '../../students/students';
import { seedIngestBinding } from '../../../test-utils/seedIngestBinding';

describe('Ingest complete updates student GET /sources', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db('scholaracle_test_ingest_sources_list');
    authService = new AuthService(database, 'test-secret');

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
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await database.dropDatabase();
    await mongoClient.close();
  });

  beforeEach(async () => {
    for (const name of [
      'users',
      'students',
      'subscriptions',
      'slc_sources',
      'slc_runs',
      'slc_device_auth',
      'slc_devices',
      'revoked_connector_tokens',
      'slc_assignments',
    ]) {
      await database.collection(name).deleteMany({});
    }
  });

  it('GET /api/students/:id/sources includes lastSuccessAt after ingest complete', async () => {
    const email = 'parent-sources@test.com';
    const reg = await authService.register(email, 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) throw new Error('register failed');
    const parentToken = reg.token;
    const userId = reg.user.id;

    const nowSub = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan: 'family',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: nowSub,
      currentPeriodEnd: new Date(nowSub.getTime() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      createdAt: nowSub,
      updatedAt: nowSub,
    });

    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ userCode: start.body.userCode as string });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode as string });
    const connectorToken = poll.body.connectorToken as string;

    const childId = new ObjectId();
    await database.collection('students').insertOne({
      _id: childId,
      userId: new ObjectId(userId),
      name: 'Riley',
      studentId: childId.toHexString(),
      dataSources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sourceId = 'src-cli-only';
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas',
      })
      .expect(200);
    await seedIngestBinding(database, userId, {
      sourceId,
      studentExternalId: childId.toHexString(),
      studentId: childId.toHexString(),
    });
    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId })
      .expect(200);
    const runId = run.body.runId as string;
    const now = new Date().toISOString();
    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        schemaVersion: 'slc.ingest.v1',
        run: {
          runId,
          startedAt: now,
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          adapterVersion: '1.0.0',
          mode: 'delta',
          timezone: 'America/Chicago',
        },
        source: { sourceId, displayName: 'Canvas' },
        ops: [
          {
            op: 'upsert',
            entity: 'assignment',
            key: {
              provider: 'canvas',
              adapterId: 'com.instructure.canvas',
              externalId: 'a-1',
              studentExternalId: childId.toHexString(),
              institutionExternalId: 'inst-1',
              courseExternalId: 'course-1',
            },
            observedAt: now,
            record: { title: 'HW', dueAt: now, status: 'missing', pointsPossible: 10 },
          },
        ],
      })
      .expect(200);

    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({})
      .expect(200);

    const listRes = await request(app)
      .get(`/api/students/${childId.toHexString()}/sources`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(1);
    const item = listRes.body[0] as { id: string; lastSuccessAt?: string };
    expect(item.id).toBe(sourceId);
    expect(typeof item.lastSuccessAt).toBe('string');
    expect(item.lastSuccessAt!.length).toBeGreaterThan(10);
  });
});
