import express, { type Express } from 'express';
import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { authMiddleware } from './auth';
import { requireParent, requireStudent } from './requireRole';
import { createErrorHandler } from './errorHandler';

describe('requireParent / requireStudent', () => {
  let app: Express;
  let database: Db;
  let client: MongoClient;
  let authService: AuthService;
  let userRepository: UserRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_role_gate_test');
    authService = new AuthService(database, 'test-secret', '1h');
    userRepository = new UserRepository(database);

    app = express();
    app.use(express.json());
    app.get('/parent-only', authMiddleware(authService), requireParent, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.get('/student-only', authMiddleware(authService), requireStudent, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
  });

  it('allows a parent on parent-only and forbids them on student-only', async () => {
    const parent = await authService.register('parent@test.com', 'Password123!', 'Parent');
    const parentRes = await request(app)
      .get('/parent-only')
      .set('Authorization', `Bearer ${parent.token}`);
    expect(parentRes.status).toBe(200);

    const studioRes = await request(app)
      .get('/student-only')
      .set('Authorization', `Bearer ${parent.token}`);
    expect(studioRes.status).toBe(403);
    expect(studioRes.body.code).toBe('FORBIDDEN');
  });

  it('allows a student on student-only and forbids them on parent-only', async () => {
    const passwordHash = await UserRepository.hashPassword('Password123!');
    await userRepository.create({
      email: 'student@test.com',
      passwordHash,
      name: 'Student',
      role: 'student',
      studentId: '507f1f77bcf86cd799439011',
    });
    const student = await authService.login('student@test.com', 'Password123!');

    const studioRes = await request(app)
      .get('/student-only')
      .set('Authorization', `Bearer ${student.token}`);
    expect(studioRes.status).toBe(200);

    const parentRes = await request(app)
      .get('/parent-only')
      .set('Authorization', `Bearer ${student.token}`);
    expect(parentRes.status).toBe(403);
    expect(parentRes.body.code).toBe('FORBIDDEN');
  });
});
