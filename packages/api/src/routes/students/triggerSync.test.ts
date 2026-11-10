/**
 * POST /api/students/:id/sources/:sourceId/runs/trigger — client-led sync request.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from './students';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('POST /api/students/:id/sources/:sourceId/runs/trigger', () => {
  jest.setTimeout(60_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let authService: AuthService;
  let token: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('trigger-sync-test');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());

    const reg = await authService.register('trigger-sync@test.com', 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) {
      throw new Error('register failed');
    }
    token = reg.token;

    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId: reg.user.id,
      plan: 'family',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: now,
      updatedAt: now,
      events: [{ type: 'created', toPlan: 'family', timestamp: now }],
    });
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('sync_requests').deleteMany({});
    await database.collection('slc_runs').deleteMany({});
    await database.collection('students').deleteMany({});
  });

  it('returns 202, message, and inserts sync_requests', async () => {
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sync Request Student', grade: 9 });
    expect(createRes.status).toBe(201);
    const studentId = createRes.body.id as string;
    const studentObjectId = new ObjectId(studentId);

    const sourceId = 'src-web-trigger-1';
    await database.collection('students').updateOne(
      { _id: studentObjectId },
      {
        $set: {
          dataSources: [
            {
              id: sourceId,
              pluginId: 'com.instructure.canvas',
              enabled: true,
              schedule: 'manual',
              dataTypes: ['grades'],
              status: 'active',
            },
          ],
        },
      }
    );

    const res = await request(app)
      .post(`/api/students/${studentId}/sources/${sourceId}/runs/trigger`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Open Scholarmancy on your phone to sync');
    expect(typeof res.body.syncRequestId).toBe('string');

    const row = await database.collection('sync_requests').findOne({
      syncRequestId: res.body.syncRequestId,
    });
    expect(row).not.toBeNull();
    expect(row?.['studentId']).toBe(studentId);
    expect(row?.['sourceId']).toBe(sourceId);

    const runsCount = await database.collection('slc_runs').countDocuments();
    expect(runsCount).toBe(0);
  });
});
