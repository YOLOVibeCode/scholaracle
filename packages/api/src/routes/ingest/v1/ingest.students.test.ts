import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';

/**
 * Students that ingest creates or matches: a phone-created student is matched by
 * its own id (no duplicate), and new students respect the plan's cap.
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
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));
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

  async function syncAssignments(
    connectorToken: string,
    studentExternalIds: readonly string[]
  ): Promise<void> {
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-phone',
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas',
      })
      .expect(200);
    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-phone' })
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
        source: { sourceId: 'src-phone', displayName: 'Canvas' },
        ops: studentExternalIds.map((studentExternalId, i) => ({
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'canvas',
            adapterId: 'com.instructure.canvas',
            externalId: `a-${i}`,
            studentExternalId,
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: { title: `HW ${i}`, dueAt: now, status: 'missing', pointsPossible: 10 },
        })),
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
    await database.collection('students').insertOne({
      _id: childId,
      userId: new ObjectId(userId),
      name: 'Ava',
      dataSources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await syncAssignments(connectorToken, [childId.toHexString()]);

    const students = await database
      .collection('students')
      .find({ userId: new ObjectId(userId) })
      .toArray();
    expect(students).toHaveLength(1);
    expect(students[0]!['studentId']).toBe(childId.toHexString());
    expect((students[0]!['dataSources'] as unknown[]).length).toBe(1);
  });

  it('does not create students beyond the plan cap on a free account', async () => {
    const { userId, connectorToken } = await connect('free-parent@test.com');

    await syncAssignments(connectorToken, ['kid-a', 'kid-b', 'kid-c', 'kid-d']);

    const count = await database
      .collection('students')
      .countDocuments({ userId: new ObjectId(userId) });
    expect(count).toBe(1);
  });

  it('creates students up to a paid plan cap', async () => {
    const { userId, connectorToken } = await connect('family-parent@test.com');
    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan: 'premium',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });

    await syncAssignments(connectorToken, ['kid-a', 'kid-b', 'kid-c']);

    const count = await database
      .collection('students')
      .countDocuments({ userId: new ObjectId(userId) });
    expect(count).toBe(2);
  });
});
