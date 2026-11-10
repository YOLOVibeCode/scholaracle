/**
 * Run telemetry: POST /runs with starting step, POST /runs/:id/trace, GET shape via students route.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { studentsRouter } from '../../students/students';
import { ingestV1Router } from './ingest';
import { authMiddleware } from '../../../middleware/auth';
import { requireParent } from '../../../middleware/requireRole';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { seedActiveConnectorJti } from '../../../testHelpers/connectorDeviceTestSeed';

function randomJti(): string {
  return `jti-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('ingest run telemetry', () => {
  jest.setTimeout(60_000);
  const jwtSecret = 'test-jwt-secret-min-32-chars-trace!!';
  const connectorJwtSecret = `${jwtSecret}-connector`;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let parentToken: string;
  let parentUserId: string;
  let studentId: string;
  let sourceId: string;
  let connectorToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('ingest-trace-test');
    const authService = new AuthService(database, jwtSecret);

    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example', jwtSecret })
    );
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret, connectorJwtSecret }));
    app.use(createErrorHandler());

    const reg = await authService.register('trace-parent@test.com', 'password123', 'Parent');
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
      .send({ name: 'Trace Kid', grade: 9 });
    expect(stuRes.status).toBe(201);
    studentId = stuRes.body.id as string;

    const addSrc = await request(app)
      .post(`/api/students/${studentId}/sources`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        provider: 'canvas',
        adapterId: 'com.test.canvas',
        displayName: 'Trace Source',
        dataTypes: ['assignments'],
        schedule: 'manual',
      });
    expect(addSrc.status).toBe(201);
    sourceId = addSrc.body.id as string;

    const jti = randomJti();
    const deviceId = 'trace-device';
    connectorToken = new ConnectorTokenService(connectorJwtSecret).createToken(
      parentUserId,
      jti,
      deviceId
    );
    await seedActiveConnectorJti(database, parentUserId, deviceId, jti);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('stores starting step, trace steps, stats, warnings, and cursor on GET', async () => {
    const runId = 'trace-run-1';
    const startedAt = '2026-02-01T12:00:00.000Z';
    const startRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        runId,
        clientMeta: { clientType: 'mobile', coreVersion: '0.2.0' },
        step: { name: 'starting', startedAt, ms: 0, ok: true },
      });
    expect(startRes.status).toBe(200);

    const traceRes = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/trace`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        step: { name: 'extracting', startedAt: '2026-02-01T12:00:05.000Z', ms: 4500, ok: true },
        stats: { extractingMs: 4500 },
        warnings: ['slow portal'],
      });
    expect(traceRes.status).toBe(200);
    expect(traceRes.body.success).toBe(true);

    const envelope = {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId,
        startedAt,
        provider: 'canvas',
        adapterId: 'com.test.canvas',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
        stats: { clientField: 1 },
      },
      source: { sourceId, displayName: 'Trace Source' },
      ops: [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: 'canvas',
            adapterId: 'com.test.canvas',
            externalId: 'course-1',
            studentExternalId: 'stu-ext-1',
            institutionExternalId: 'inst-1',
          },
          observedAt: startedAt,
          record: { title: 'Bio' },
        },
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: 'canvas',
            adapterId: 'com.test.canvas',
            externalId: 'course-bad',
            studentExternalId: 'stu-ext-1',
            institutionExternalId: 'inst-1',
          },
          observedAt: startedAt,
          record: {},
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
      .send({ status: 'success', cursor: { type: 'opaque', value: 'cursor-trace-1' } })
      .expect(200);

    const one = await request(app)
      .get(`/api/students/${studentId}/sources/${sourceId}/runs/${runId}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(one.status).toBe(200);
    expect(one.body.steps?.length).toBeGreaterThanOrEqual(2);
    expect(one.body.steps[0].name).toBe('starting');
    expect(one.body.stats).toBeDefined();
    expect(one.body.stats.opsTotal).toBe(2);
    expect(one.body.newCursor).toEqual({ type: 'opaque', value: 'cursor-trace-1' });
    expect(one.body.clientMeta).toEqual({ clientType: 'mobile', coreVersion: '0.2.0' });
    const warnings = one.body.warnings as string[];
    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings.some((w: string) => w.includes('slow portal') || w.includes('course'))).toBe(
      true
    );
  });
});
