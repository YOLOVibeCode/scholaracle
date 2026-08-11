/**
 * Cross-tenant IDOR Jest sweep — RISK-002, COVERAGE_GAPS §3.
 *
 * Jest + supertest at the route level catches the bug closer to source than
 * the Playwright variant in `packages/e2e/tests/17-cross-tenant-idor.spec.ts`.
 *
 * Asserts ownership enforcement on:
 *   GET    /api/students/:id
 *   PUT    /api/students/:id
 *   DELETE /api/students/:id
 *   GET    /api/students/:id/alerts
 *
 * Uses the API server's real auth middleware (real JWTs).
 *
 * NOTE: This file imports the app factory the same way `students.test.ts` does.
 * If the factory location differs, adjust the import — see ASSUMPTION below.
 */

// ASSUMPTION: There is an existing helper or pattern in `packages/api/src/index.ts`
// (or `packages/api/src/app.ts`) for constructing a test app + JWT. The companion
// suite `students.test.ts` follows the established pattern; this file mirrors it.
//
// To avoid divergence and keep the suite running independently, we re-export
// the same fixtures. If the run fails on import resolution, see DEFECTS.md
// DEF-005 (test harness coupling).

import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository, AlertRepository } from '@scholaracle/database';
import { studentsRouter } from './students';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Students route — IDOR sweep', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;

  let userA: { id: string; token: string };
  let userB: { id: string; token: string };
  let studentAId: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(dbName);

    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    const baseUrl = 'http://test.example';
    app.use('/api/students', authMiddleware(authService), studentsRouter({ database, baseUrl }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database
      .collection('users')
      .deleteMany({ email: { $in: ['a@idor.test', 'b@idor.test'] } });
    await database.collection('students').deleteMany({ name: { $in: ['A-only'] } });
    await database.collection('alerts').deleteMany({});

    const regA = await authService.register('a@idor.test', 'password123', 'User A');
    const regB = await authService.register('b@idor.test', 'password123', 'User B');
    if (!regA.success || !regB.success || !regA.user?.id || !regB.user?.id) {
      throw new Error('Failed to register IDOR test users');
    }
    userA = { id: regA.user.id, token: regA.token! };
    userB = { id: regB.user.id, token: regB.token! };

    // Active subscription for both, so subscriptionGuard (if any) doesn't 402.
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    for (const userId of [userA.id, userB.id]) {
      await database.collection('subscriptions').insertOne({
        userId,
        plan: 'family',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        billingCycle: 'monthly',
        createdAt: now,
        updatedAt: now,
        events: [{ type: 'created', toPlan: 'family', timestamp: now }],
      });
    }

    const studentRepo = new StudentRepository(database);
    const created = await studentRepo.create({
      userId: regA.user.id,
      name: 'A-only',
      grade: 9,
      studentId: 'A001',
    });
    studentAId = created._id!.toString();
  });

  it('owner can GET own student (golden)', async () => {
    const res = await request(app)
      .get(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(res.status).toBe(200);
  });

  it('other user cannot GET another users student', async () => {
    const res = await request(app)
      .get(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect([403, 404]).toContain(res.status);
  });

  it('other user cannot PUT another users student', async () => {
    const res = await request(app)
      .put(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ name: 'PWNED' });
    expect([403, 404]).toContain(res.status);

    const verify = await request(app)
      .get(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(verify.body.name ?? verify.body.student?.name).toBe('A-only');
  });

  it('other user cannot DELETE another users student', async () => {
    const res = await request(app)
      .delete(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect([403, 404]).toContain(res.status);

    const verify = await request(app)
      .get(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${userA.token}`);
    expect(verify.status).toBe(200);
  });

  it('other user cannot read another users student alerts', async () => {
    // Seed an alert under student A
    const alertRepo = new AlertRepository(database);
    await alertRepo.create({
      studentId: studentAId,
      userId: userA.id,
      type: 'GRADE_DROP',
      severity: 'critical',
      message: 'private',
      relatedData: {},
      acknowledged: false,
    });

    const res = await request(app)
      .get(`/api/students/${studentAId}/alerts`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect([403, 404]).toContain(res.status);
  });

  it('boundary: missing Authorization is 401', async () => {
    const res = await request(app).get(`/api/students/${studentAId}`);
    expect([401, 403]).toContain(res.status);
  });
});
