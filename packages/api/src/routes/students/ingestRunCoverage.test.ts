/**
 * Ingest run coverage: persisted on envelope upload, returned on GET .../runs/:runId.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import { studentsRouter } from './students';
import { ingestV1Router } from '../ingest/v1/ingest';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';

function randomJti(): string {
  return `jti-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

describe('GET ingest run coverage', () => {
  jest.setTimeout(60_000);
  const jwtSecret = 'test-jwt-secret-min-32-chars-for-ingest!!';
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let authService: AuthService;
  let parentToken: string;
  let parentUserId: string;
  let studentId: string;
  let sourceId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('ingest-run-coverage-test');
    authService = new AuthService(database, jwtSecret);

    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example', jwtSecret })
    );
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret }));
    app.use(createErrorHandler());

    const reg = await authService.register('cov-parent@test.com', 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) throw new Error('register failed');
    parentToken = reg.token;
    parentUserId = reg.user.id;

    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId: parentUserId,
      plan: 'family',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });

    const stuRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ name: 'Cov Kid', grade: 9 });
    expect(stuRes.status).toBe(201);
    studentId = stuRes.body.id as string;

    const addSrc = await request(app)
      .post(`/api/students/${studentId}/sources`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        provider: 'canvas',
        adapterId: 'com.test.canvas',
        displayName: 'Test Source',
        dataTypes: ['assignments'],
        schedule: 'manual',
      });
    expect(addSrc.status).toBe(201);
    sourceId = addSrc.body.id as string;
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('stores coverage on envelope and returns it from GET .../runs/:runId', async () => {
    const connectorToken = new ConnectorTokenService(jwtSecret).createToken(
      parentUserId,
      randomJti()
    );
    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId });
    expect(runRes.status).toBe(200);
    const runId = runRes.body.runId as string;
    const now = new Date().toISOString();

    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'canvas',
        adapterId: 'com.test.canvas',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
      },
      source: { sourceId, displayName: 'Test' },
      ops: [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: 'canvas',
            adapterId: 'com.test.canvas',
            externalId: 'course-x',
            studentExternalId: 'stu-ext-1',
            institutionExternalId: 'inst-1',
          },
          observedAt: now,
          record: { title: 'Bio 101' },
        },
      ],
    };

    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope)
      .expect(200);

    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ status: 'success' })
      .expect(200);

    const one = await request(app)
      .get(`/api/students/${studentId}/sources/${sourceId}/runs/${runId}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(one.status).toBe(200);
    expect(one.body.coverage?.students?.[0]?.gaps?.length).toBeGreaterThan(0);
    expect(Array.isArray(one.body.warnings)).toBe(true);

    const list = await request(app)
      .get(`/api/students/${studentId}/sources/${sourceId}/runs`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(list.status).toBe(200);
    const row = (list.body as Array<{ runId: string; coverage?: unknown }>).find(
      (r) => r.runId === runId
    );
    expect(row?.coverage).toBeDefined();
  });
});
