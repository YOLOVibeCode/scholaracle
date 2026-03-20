/**
 * Sync API route tests — POST/GET sync triggers and run listing.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import {
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  SessionRepository,
} from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { authRouter } from '../auth/auth';
import { authMiddleware } from '../../middleware/auth';
import { createSyncRouter, type ISyncRouterConfig } from './sync';

const noOpEmailSender = { sendResetLink: async (): Promise<void> => {} };

describe('Sync API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;
  let testUserId: string;
  let otherUserId: string;
  let mockTriggerAllForStudent: jest.Mock;
  let mockTriggerNow: jest.Mock;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping sync tests');
      return;
    }

    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const refreshTokenStore = new RefreshTokenRepository(database);
    const sessionRepo = new SessionRepository(database);
    authService = new AuthService(
      database,
      'test-secret',
      '15m',
      passwordResetTokenStore,
      noOpEmailSender,
      'http://localhost:2800',
      refreshTokenStore,
      '30d',
      '24h',
      undefined
    );

    mockTriggerAllForStudent = jest
      .fn()
      .mockResolvedValue([new ObjectId().toString(), new ObjectId().toString()]);
    mockTriggerNow = jest.fn().mockResolvedValue(new ObjectId().toString());

    const syncScheduler = {
      triggerAllForStudent: mockTriggerAllForStudent,
      triggerNow: mockTriggerNow,
    } as unknown as ISyncRouterConfig['syncScheduler'];

    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        passwordResetTokenStore,
        passwordResetEmailSender: noOpEmailSender,
        baseUrl: 'http://localhost:2800',
        refreshTokenStore,
        refreshTokenExpiresIn: '30d',
        sessionRepository: sessionRepo,
        authService,
      })
    );
    app.use(
      '/api/sync',
      authMiddleware(authService),
      createSyncRouter({ database, syncScheduler })
    );
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  beforeEach(async () => {
    if (!database) return;
    await database.collection('users').deleteMany({
      email: { $in: ['sync@example.com', 'sync-other@example.com'] },
    });
    await database.collection('refresh_tokens').deleteMany({});
    await database.collection('students').deleteMany({});
    await database.collection('sync_runs').deleteMany({});
    await database.collection('jobs').deleteMany({});
    await database.collection('worker_heartbeats').deleteMany({});
    mockTriggerAllForStudent.mockClear();
    mockTriggerNow.mockClear();

    const registerRes = await request(app).post('/api/auth/register').send({
      email: 'sync@example.com',
      password: 'password123',
      name: 'Sync User',
    });
    if (registerRes.status !== 201 || !registerRes.body.token) {
      throw new Error(`Register failed: ${JSON.stringify(registerRes.body)}`);
    }
    testToken = registerRes.body.token;
    testUserId = registerRes.body.user?.id;
    if (!testUserId) throw new Error('No user id in register response');

    const otherRes = await request(app).post('/api/auth/register').send({
      email: 'sync-other@example.com',
      password: 'password123',
      name: 'Other User',
    });
    if (otherRes.status !== 201 || !otherRes.body.token) {
      throw new Error(`Other user register failed: ${JSON.stringify(otherRes.body)}`);
    }
    otherUserId = otherRes.body.user?.id ?? '';
  });

  describe('POST /api/sync/students/:studentId', () => {
    it('should return 401 without token', async () => {
      const studentId = new ObjectId();
      const response = await request(app).post(`/api/sync/students/${studentId}`);
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid student ID', async () => {
      const response = await request(app)
        .post('/api/sync/students/not-an-object-id')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });

    it('should return 404 for unknown student', async () => {
      const studentId = new ObjectId();
      const response = await request(app)
        .post(`/api/sync/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 403 when user does not own or share student', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: new ObjectId(otherUserId),
        name: 'Other Student',
        dataSources: [
          { pluginId: 'canvas::default', config: { institutionUrl: 'https://canvas.example.com' } },
        ],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Access denied');
    });

    it('should return 400 when student has no data sources', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: testUserId,
        name: 'No Sources Student',
        dataSources: [],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no data sources');
    });

    it('should return 200 and enqueue sync jobs for owner', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: testUserId,
        name: 'My Student',
        dataSources: [
          { pluginId: 'canvas::default', config: { institutionUrl: 'https://canvas.example.com' } },
          {
            pluginId: 'skyward::default',
            config: { institutionUrl: 'https://skyward.example.com' },
          },
        ],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.jobIds).toHaveLength(2);
      expect(response.body.queue).toBeDefined();
      expect(response.body.queue).toHaveProperty('depth');
      expect(response.body.queue).toHaveProperty('estimatedWaitMs');
      expect(mockTriggerAllForStudent).toHaveBeenCalledWith(
        studentId.toString(),
        testUserId,
        expect.any(Array)
      );
    });
  });

  describe('POST /api/sync/students/:studentId/:dsIndex', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).post('/api/sync/students/507f1f77bcf86cd799439011/0');
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid student ID', async () => {
      const response = await request(app)
        .post('/api/sync/students/invalid/0')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid data source index', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: testUserId,
        name: 'Student',
        dataSources: [{ pluginId: 'canvas::default' }],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}/-1`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid data source index');
    });

    it('should return 404 when student not found', async () => {
      const studentId = new ObjectId();
      const response = await request(app)
        .post(`/api/sync/students/${studentId}/0`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
    });

    it('should return 404 when data source index out of range', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: testUserId,
        name: 'Student',
        dataSources: [{ pluginId: 'canvas::default' }],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}/5`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 200 and enqueue single source sync', async () => {
      const studentId = new ObjectId();
      await database.collection('students').insertOne({
        _id: studentId,
        userId: testUserId,
        name: 'Student',
        dataSources: [
          { pluginId: 'canvas::default', config: { institutionUrl: 'https://canvas.example.com' } },
        ],
      });
      const response = await request(app)
        .post(`/api/sync/students/${studentId}/0`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.jobId).toBeDefined();
      expect(response.body.queue).toBeDefined();
      expect(response.body.queue).toHaveProperty('position');
      expect(response.body.queue).toHaveProperty('estimatedWaitMs');
      expect(mockTriggerNow).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: studentId.toString(),
          dataSourceIndex: 0,
          provider: 'canvas',
          adapterId: 'canvas::default',
          userId: testUserId,
        })
      );
    });
  });

  describe('GET /api/sync/students/:studentId/runs', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/sync/students/507f1f77bcf86cd799439011/runs');
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid student ID', async () => {
      const response = await request(app)
        .get('/api/sync/students/invalid/runs')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
    });

    it('should return 200 with runs list for owner', async () => {
      const studentId = new ObjectId();
      const runId = new ObjectId();
      await database.collection('sync_runs').insertOne({
        _id: runId,
        studentId: studentId.toString(),
        userId: testUserId,
        createdAt: new Date(),
        status: 'completed',
      });
      const response = await request(app)
        .get(`/api/sync/students/${studentId}/runs`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.runs).toHaveLength(1);
      expect(response.body.runs[0]).toHaveProperty('_id');
      expect(response.body.runs[0].status).toBe('completed');
    });

    it('should respect limit query param', async () => {
      const studentId = new ObjectId();
      await database.collection('sync_runs').insertMany([
        {
          studentId: studentId.toString(),
          userId: testUserId,
          createdAt: new Date(),
          status: 'completed',
        },
        {
          studentId: studentId.toString(),
          userId: testUserId,
          createdAt: new Date(),
          status: 'completed',
        },
        {
          studentId: studentId.toString(),
          userId: testUserId,
          createdAt: new Date(),
          status: 'completed',
        },
      ]);
      const response = await request(app)
        .get(`/api/sync/students/${studentId}/runs?limit=2`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.runs).toHaveLength(2);
    });
  });

  describe('GET /api/sync/runs/:runId', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/sync/runs/507f1f77bcf86cd799439011');
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid run ID', async () => {
      const response = await request(app)
        .get('/api/sync/runs/invalid')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });

    it('should return 404 for unknown run', async () => {
      const runId = new ObjectId();
      const response = await request(app)
        .get(`/api/sync/runs/${runId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 200 with run for owner', async () => {
      const runId = new ObjectId();
      await database.collection('sync_runs').insertOne({
        _id: runId,
        studentId: new ObjectId().toString(),
        userId: testUserId,
        createdAt: new Date(),
        status: 'running',
      });
      const response = await request(app)
        .get(`/api/sync/runs/${runId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.run).toBeDefined();
      expect(response.body.run.status).toBe('running');
      expect(response.body.run._id).toBeDefined();
    });

    it('should return 404 when run belongs to another user', async () => {
      const runId = new ObjectId();
      await database.collection('sync_runs').insertOne({
        _id: runId,
        studentId: new ObjectId().toString(),
        userId: otherUserId,
        createdAt: new Date(),
        status: 'completed',
      });
      const response = await request(app)
        .get(`/api/sync/runs/${runId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/sync/capacity', () => {
    it('should return queue stats and capacity with no workers', async () => {
      const response = await request(app)
        .get('/api/sync/capacity')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.queue).toBeDefined();
      expect(response.body.queue.pending).toBe(0);
      expect(response.body.capacity).toBeDefined();
      expect(response.body.capacity.workerCount).toBe(0);
      expect(response.body.capacity.totalSlots).toBe(0);
      expect(response.body.capacity.availableSlots).toBe(0);
      expect(response.body.workers).toEqual([]);
    });

    it('should reflect active workers from heartbeats', async () => {
      await database.collection('worker_heartbeats').insertOne({
        workerId: 'worker-test-1',
        syncConcurrency: 3,
        activeSyncJobs: 1,
        memoryMB: { rss: 256, heapUsed: 128, heapTotal: 200 },
        lastHeartbeat: new Date(),
      });
      const response = await request(app)
        .get('/api/sync/capacity')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.capacity.workerCount).toBe(1);
      expect(response.body.capacity.totalSlots).toBe(3);
      expect(response.body.capacity.activeJobs).toBe(1);
      expect(response.body.capacity.availableSlots).toBe(2);
      expect(response.body.workers).toHaveLength(1);
      expect(response.body.workers[0].workerId).toBe('worker-test-1');
    });
  });

  describe('GET /api/sync/jobs/:jobId/position', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).get(`/api/sync/jobs/${new ObjectId()}/position`);
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .get('/api/sync/jobs/invalid/position')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
    });

    it('should return position -1 for non-existent job', async () => {
      const jobId = new ObjectId();
      const response = await request(app)
        .get(`/api/sync/jobs/${jobId}/position`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.position).toBe(-1);
    });
  });
});
