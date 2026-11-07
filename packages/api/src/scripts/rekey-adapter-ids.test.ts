/**
 * Re-key legacy adapterIds — dry-run counts and action-board dedupe.
 */

import express, { type Express } from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from '../routes/students/students';
import { authMiddleware } from '../middleware/auth';
import { requireParent } from '../middleware/requireRole';
import { createErrorHandler } from '../middleware/errorHandler';
import { countLegacyAdapterIds, rekeyAdapterIds } from './rekey-adapter-ids-lib';

describe('rekey-adapter-ids-lib', () => {
  let memoryServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let database: Db;
  let app: Express;
  let authService: AuthService;
  let testToken: string;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    const uri = memoryServer.getUri();
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db('rekey_test');
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
  }, 60_000);

  afterAll(async () => {
    await mongoClient?.close();
    await memoryServer.stop();
  });

  beforeEach(async () => {
    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_courses').deleteMany({});
    const registerResult = await authService.register(
      'rekey-parent@example.com',
      'password123',
      'Rekey Parent'
    );
    if (!registerResult.token) throw new Error('register failed');
    testToken = registerResult.token;
    await database.collection('subscriptions').insertOne({
      userId: registerResult.user!.id,
      plan: 'family',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  function assignmentIdsFromBoard(body: {
    buckets: Array<{ items: Array<{ assignmentExternalId: string }> }>;
  }): string[] {
    const ids: string[] = [];
    for (const bucket of body.buckets) {
      for (const item of bucket.items) {
        ids.push(item.assignmentExternalId);
      }
    }
    return ids;
  }

  it('dry-run prints counts; apply clears legacy ids and dedupes action board', async () => {
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Rekey Student', grade: 10 });
    const studentId = createRes.body.id as string;
    const userId =
      (
        await database.collection('users').findOne({ email: 'rekey-parent@example.com' })
      )?._id?.toString() ?? '';

    await database.collection('slc_courses').insertOne({
      userId,
      provider: 'canvas',
      adapterId: 'canvas',
      externalId: 'course-rk',
      deletedAt: null,
      record: { name: 'Bio' },
    });

    const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await database.collection('slc_assignments').insertMany([
      {
        userId,
        studentId,
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        externalId: 'dup-assign-1',
        courseExternalId: 'course-rk',
        deletedAt: null,
        record: { title: 'Lab Report', status: 'missing', dueAt },
      },
      {
        userId,
        studentId,
        provider: 'canvas',
        adapterId: 'canvas',
        externalId: 'dup-assign-1',
        courseExternalId: 'course-rk',
        deletedAt: null,
        record: { title: 'Lab Report', status: 'missing', dueAt },
      },
    ]);

    const beforeBoard = await request(app)
      .get(`/api/students/${studentId}/action-board`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(beforeBoard.status).toBe(200);
    const beforeIds = assignmentIdsFromBoard(beforeBoard.body);
    expect(beforeIds.filter((id) => id === 'dup-assign-1').length).toBe(2);

    const dryStats = await rekeyAdapterIds({ db: database, apply: false });
    expect(dryStats.byCollection['slc_assignments']?.wouldMerge).toBe(1);

    const beforeLegacy = await countLegacyAdapterIds(database);
    expect(beforeLegacy['com.instructure.canvas']).toBeGreaterThanOrEqual(1);

    await rekeyAdapterIds({ db: database, apply: true });

    const afterLegacy = await countLegacyAdapterIds(database);
    expect(Object.keys(afterLegacy).length).toBe(0);

    const afterBoard = await request(app)
      .get(`/api/students/${studentId}/action-board`)
      .set('Authorization', `Bearer ${testToken}`);
    const afterIds = assignmentIdsFromBoard(afterBoard.body);
    expect(afterIds.filter((id) => id === 'dup-assign-1').length).toBe(1);
  });
});
