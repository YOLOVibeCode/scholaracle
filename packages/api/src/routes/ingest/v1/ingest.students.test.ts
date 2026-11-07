import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { SlcBindingRepository } from '@scholaracle/database';
import { INGEST_MISSING_BINDING_CODE } from '@scholaracle/contracts';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';

/**
 * Students that ingest matches via bindings (no auto-create on envelope).
 */
describe('Ingest v1: student matching and plan cap', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db('scholaracle_test_ingest_students');
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
      'slc_bindings',
      'slc_device_auth',
      'slc_devices',
      'revoked_connector_tokens',
      'slc_assignments',
    ]) {
      await database.collection(name).deleteMany({});
    }
  });

  async function connect(email: string): Promise<{ userId: string; connectorToken: string }> {
    const reg = await authService.register(email, 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) throw new Error('register failed');
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${reg.token}`)
      .send({ userCode: start.body.userCode as string });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode as string });
    return { userId: reg.user.id, connectorToken: poll.body.connectorToken as string };
  }

  async function upsertBinding(
    userId: string,
    params: {
      readonly sourceId: string;
      readonly studentExternalId: string;
      readonly studentId: string;
    }
  ): Promise<void> {
    const repo = new SlcBindingRepository(database);
    await repo.upsert({
      userId,
      portalAccountId: 'pa-test',
      studentId: params.studentId,
      sourceId: params.sourceId,
      studentExternalId: params.studentExternalId,
    });
  }

  function buildAssignmentOps(studentExternalIds: readonly string[], now: string) {
    return studentExternalIds.map((studentExternalId, i) => ({
      op: 'upsert' as const,
      entity: 'assignment' as const,
      key: {
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        externalId: `a-${i}-${studentExternalId}`,
        studentExternalId,
        institutionExternalId: 'inst-1',
        courseExternalId: 'course-1',
      },
      observedAt: now,
      record: { title: `HW ${i}`, dueAt: now, status: 'missing', pointsPossible: 10 },
    }));
  }

  async function startIngestRun(connectorToken: string, sourceId = 'src-phone'): Promise<string> {
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
    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId })
      .expect(200);
    return run.body.runId as string;
  }

  async function syncAssignments(
    connectorToken: string,
    studentExternalIds: readonly string[],
    sourceId = 'src-phone'
  ): Promise<void> {
    const runId = await startIngestRun(connectorToken, sourceId);
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
        ops: buildAssignmentOps(studentExternalIds, now),
      })
      .expect(200);
    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({})
      .expect(200);
  }

  it('fills a phone-created student keyed by its own id instead of creating a duplicate', async () => {
    const { userId, connectorToken } = await connect('phone-parent@test.com');
    const childId = new ObjectId();
    const hex = childId.toHexString();
    await database.collection('students').insertOne({
      _id: childId,
      userId: new ObjectId(userId),
      name: 'Avery',
      dataSources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await upsertBinding(userId, {
      sourceId: 'src-phone',
      studentExternalId: hex,
      studentId: hex,
    });

    await syncAssignments(connectorToken, [hex]);

    const students = await database
      .collection('students')
      .find({ userId: new ObjectId(userId) })
      .toArray();
    expect(students).toHaveLength(1);
    expect((students[0]!['dataSources'] as unknown[]).length).toBe(1);
  });

  it('rejects ingest without a binding with 422 when INGEST_REQUIRE_BINDINGS=true', async () => {
    process.env['INGEST_REQUIRE_BINDINGS'] = 'true';
    const { connectorToken } = await connect('no-binding@test.com');
    const runId = await startIngestRun(connectorToken);
    const now = new Date().toISOString();
    const blocked = await request(app)
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
        source: { sourceId: 'src-phone', displayName: 'Canvas' },
        ops: buildAssignmentOps(['kid-a'], now),
      });
    delete process.env['INGEST_REQUIRE_BINDINGS'];
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe(INGEST_MISSING_BINDING_CODE);
  });

  it('accepts ingest without a binding while INGEST_REQUIRE_BINDINGS is off (legacy sources)', async () => {
    delete process.env['INGEST_REQUIRE_BINDINGS'];
    const { connectorToken } = await connect('legacy-no-binding@test.com');
    const runId = await startIngestRun(connectorToken);
    const now = new Date().toISOString();
    const res = await request(app)
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
        source: { sourceId: 'src-phone', displayName: 'Canvas' },
        ops: buildAssignmentOps(['kid-a'], now),
      });
    expect(res.status).toBe(200);
  });

  it('runs two students as separate ingest runs with distinct studentExternalId', async () => {
    const { userId, connectorToken } = await connect('two-kids@test.com');
    const kidA = new ObjectId();
    const kidB = new ObjectId();
    await database.collection('students').insertMany([
      {
        _id: kidA,
        userId: new ObjectId(userId),
        name: 'Kid A',
        studentId: 'kid-a',
        dataSources: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: kidB,
        userId: new ObjectId(userId),
        name: 'Kid B',
        studentId: 'kid-b',
        dataSources: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await upsertBinding(userId, {
      sourceId: 'src-a',
      studentExternalId: 'kid-a',
      studentId: kidA.toHexString(),
    });
    await upsertBinding(userId, {
      sourceId: 'src-b',
      studentExternalId: 'kid-b',
      studentId: kidB.toHexString(),
    });

    await syncAssignments(connectorToken, ['kid-a'], 'src-a');
    await syncAssignments(connectorToken, ['kid-b'], 'src-b');

    const runs = await database.collection('slc_runs').find({}).toArray();
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const committed = runs.filter((r) => r['status'] === 'committed');
    expect(committed.length).toBe(2);
    const bindings = await database.collection('slc_bindings').find({ userId }).toArray();
    expect(bindings.map((b) => b['studentExternalId']).sort()).toEqual(['kid-a', 'kid-b']);
  });
});
