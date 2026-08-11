/**
 * IDOR + auth coverage for POST /api/alerts — DEFECTS.md DEF-003.
 *
 * Two distinct bugs are covered:
 *   1. /api/alerts has no authMiddleware → unauthenticated callers can POST.
 *   2. Even with auth, the handler accepts an arbitrary studentId from the body
 *      and never verifies the caller has access to that student.
 *
 * RED state on first run: all four cases below should fail until WS1 GREEN
 * wires authMiddleware + an IStudentReader-based ownership check.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';
import type { NotificationService, MongoQueue } from '@scholaracle/agents';
import { alertsRouter } from './alerts';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('POST /api/alerts — DEF-003 (auth + IDOR)', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;
  let studentRepository: StudentRepository;

  let parentA: { id: string; token: string };
  let parentB: { id: string; token: string };
  let studentAId: string;

  const mockQueue = {
    add: jest.fn().mockResolvedValue('job-mock'),
  } as unknown as MongoQueue;

  const mockNotificationService = {
    processAlert: jest.fn(),
  } as unknown as NotificationService;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(dbName);

    authService = new AuthService(database);
    studentRepository = new StudentRepository(database);

    app = express();
    app.use(express.json());
    app.use(
      '/api/alerts',
      authMiddleware(authService),
      alertsRouter(mockNotificationService, {
        queue: mockQueue,
        studentReader: studentRepository,
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockQueue.add as jest.Mock).mockResolvedValue('job-mock');

    await database
      .collection('users')
      .deleteMany({ email: { $in: ['a@def003.test', 'b@def003.test'] } });
    await database.collection('students').deleteMany({ name: { $in: ['A-only-def003'] } });
    await database.collection('alerts').deleteMany({});

    const regA = await authService.register('a@def003.test', 'password123', 'Parent A');
    const regB = await authService.register('b@def003.test', 'password123', 'Parent B');
    if (!regA.success || !regB.success || !regA.user?.id || !regB.user?.id) {
      throw new Error('Failed to register DEF-003 users');
    }
    parentA = { id: regA.user.id, token: regA.token! };
    parentB = { id: regB.user.id, token: regB.token! };

    const created = await studentRepository.create({
      userId: regA.user.id,
      name: 'A-only-def003',
      grade: 9,
      studentId: 'A-DEF003-001',
    });
    studentAId = created._id!.toString();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const res = await request(app).post('/api/alerts').send({
      studentId: studentAId,
      type: AlertType.GRADE_DROP,
      severity: 'critical',
    });

    expect(res.status).toBe(401);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user is not the student owner (IDOR)', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${parentB.token}`)
      .send({
        studentId: studentAId,
        type: AlertType.GRADE_DROP,
        severity: 'critical',
        relatedData: { course: 'Math' },
      });

    expect([403, 404]).toContain(res.status);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('returns 404 when the student does not exist', async () => {
    const fakeStudentId = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${parentA.token}`)
      .send({
        studentId: fakeStudentId,
        type: AlertType.GRADE_DROP,
        severity: 'critical',
      });

    expect([403, 404]).toContain(res.status);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('owner can POST against own student (golden path, returns 202 with queue)', async () => {
    const res = await request(app)
      .post('/api/alerts')
      .set('Authorization', `Bearer ${parentA.token}`)
      .send({
        studentId: studentAId,
        type: AlertType.GRADE_DROP,
        severity: 'critical',
        relatedData: { course: 'Math' },
      });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ jobId: 'job-mock' });
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('forces alert.userId to req.userId — body-supplied userId is ignored', async () => {
    await request(app).post('/api/alerts').set('Authorization', `Bearer ${parentA.token}`).send({
      studentId: studentAId,
      type: AlertType.GRADE_DROP,
      severity: 'critical',
      userId: parentB.id,
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const enqueuedPayload = (mockQueue.add as jest.Mock).mock.calls[0]![2] as {
      alert: { userId?: string };
    };
    expect(enqueuedPayload.alert.userId).toBe(parentA.id);
    expect(enqueuedPayload.alert.userId).not.toBe(parentB.id);
  });
});
