/**
 * Slice 6 — parent provisions / revokes a student login from /api/students/:id/login.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { assertNoGradeLeak, parseTodayView } from '@scholaracle/contracts';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA, DEMO_STUDENT_USER_LIAM } from '../seed/demo-data';
import { authRouter } from '../auth/auth';
import { studentsRouter } from './students';
import { studioRouter } from '../studio/studio';
import { StudentRepository } from '@scholaracle/database';

const NORA_LOGIN_EMAIL = 'nora.provision@example.com';

describe('student login provision API', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let parentToken: string;
  let emmaToken: string;
  let emmaId: string;
  let liamId: string;
  let noraId: string;
  let parentUserId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-slice6');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        authService,
        baseUrl: 'http://test.example',
      })
    );
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: 'test-secret',
      })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: 'test-secret',
      })
    );
    app.use(createErrorHandler());

    const seeded = await request(app).post('/api/seed/demo');
    expect(seeded.status).toBe(200);

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined || parent.user === undefined) {
      throw new Error('Parent login failed');
    }
    parentToken = parent.token;
    parentUserId = parent.user.id;

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined) {
      throw new Error('Emma student login failed');
    }
    emmaToken = emma.token;

    const list = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${parentToken}`);
    expect(list.status).toBe(200);
    const emmaRow = (list.body as { id: string; studentId?: string }[]).find(
      (s) => s.studentId === 'demo-emma'
    );
    const liamRow = (list.body as { id: string; studentId?: string }[]).find(
      (s) => s.studentId === 'demo-liam'
    );
    if (emmaRow === undefined || liamRow === undefined) {
      throw new Error('Demo students missing from list');
    }
    emmaId = emmaRow.id;
    liamId = liamRow.id;

    const nora = await new StudentRepository(database).create({
      userId: parentUserId,
      name: 'Nora Provision',
      grade: 8,
    });
    noraId = nora._id?.toString() ?? '';
    if (noraId === '') {
      throw new Error('Nora fixture missing id');
    }
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('GET returns Emma’s seeded login without a password', async () => {
    const res = await request(app)
      .get(`/api/students/${emmaId}/login`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.provisioned).toBe(true);
    expect(res.body.email).toBe(DEMO_STUDENT_USER_EMMA.email);
    expect(res.body.showGrades).toBe(false);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it('GET returns Liam’s seeded login without a password', async () => {
    const res = await request(app)
      .get(`/api/students/${liamId}/login`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.provisioned).toBe(true);
    expect(res.body.email).toBe(DEMO_STUDENT_USER_LIAM.email);
    expect(res.body.showGrades).toBe(false);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(res.body.password).toBeUndefined();
  });

  it('invite creates a student-role user and returns email + temp password', async () => {
    const res = await request(app)
      .post(`/api/students/${noraId}/login`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ email: NORA_LOGIN_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(NORA_LOGIN_EMAIL);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);

    const login = await authService.login(NORA_LOGIN_EMAIL, res.body.temporaryPassword);
    expect(login.success).toBe(true);
    expect(login.user?.role).toBe('student');
    expect(login.user?.studentId).toBe(noraId);

    const audits = await database
      .collection('student_login_audit')
      .find({ studentId: noraId, action: 'invite' })
      .toArray();
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0]?.['actorUserId']).toBe(parentUserId);
    expect(JSON.stringify(audits)).not.toContain(res.body.temporaryPassword as string);
    expect(JSON.stringify(audits)).not.toMatch(/temporaryPassword/);
  });

  it('second invite resets the password and invalidates the old one', async () => {
    const first = await request(app)
      .post(`/api/students/${noraId}/login`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ email: NORA_LOGIN_EMAIL });
    const oldPassword = first.body.temporaryPassword as string;

    const second = await request(app)
      .post(`/api/students/${noraId}/login`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({});

    expect(second.status).toBe(200);
    expect(second.body.email).toBe(NORA_LOGIN_EMAIL);
    expect(second.body.temporaryPassword).not.toBe(oldPassword);

    const stale = await authService.login(NORA_LOGIN_EMAIL, oldPassword);
    expect(stale.success).toBe(false);

    const fresh = await authService.login(NORA_LOGIN_EMAIL, second.body.temporaryPassword);
    expect(fresh.success).toBe(true);
  });

  it('invite for a student the parent does not own returns 403', async () => {
    const other = await authService.register(
      'other.parent@example.com',
      'Password123!',
      'Other Parent'
    );
    if (!other.success || other.token === undefined) {
      throw new Error('Other parent register failed');
    }

    const res = await request(app)
      .post(`/api/students/${emmaId}/login`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ email: 'stolen.emma@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('student JWT cannot call provision endpoints', async () => {
    const res = await request(app)
      .post(`/api/students/${emmaId}/login`)
      .set('Authorization', `Bearer ${emmaToken}`)
      .send({ email: 'nope@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('setShowGrades(false) leaves Today encouragement without scores', async () => {
    const patch = await request(app)
      .patch(`/api/students/${emmaId}/login`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ showGrades: false });
    expect(patch.status).toBe(200);
    expect(patch.body.showGrades).toBe(false);

    const today = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(today.status).toBe(200);
    const view = parseTodayView(today.body);
    assertNoGradeLeak(view, false);
    expect(JSON.stringify(today.body)).not.toMatch(/\d+\s*%/);
    expect(JSON.stringify(today.body)).not.toMatch(/\b[ABCDF][+-](?!\w)/);
  });

  it('revoke blocks login and existing JWT fails subsequent studio calls', async () => {
    const invited = await request(app)
      .post(`/api/students/${noraId}/login`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ email: NORA_LOGIN_EMAIL });
    const noraLogin = await authService.login(NORA_LOGIN_EMAIL, invited.body.temporaryPassword);
    if (!noraLogin.success || noraLogin.token === undefined || noraLogin.user === undefined) {
      throw new Error('Nora login after invite failed');
    }

    const before = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${noraLogin.token}`);
    expect(before.status).toBe(200);

    const revoked = await request(app)
      .delete(`/api/students/${noraId}/login`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(revoked.status).toBe(200);

    const afterLogin = await authService.login(NORA_LOGIN_EMAIL, invited.body.temporaryPassword);
    expect(afterLogin.success).toBe(false);

    const afterStudio = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${noraLogin.token}`);
    expect([401, 403]).toContain(afterStudio.status);
  });

  describe('iPad magic-link / QR', () => {
    it('parent issues a /login?magic= URL + QR; consume signs Emma into studio', async () => {
      const issued = await request(app)
        .post(`/api/students/${emmaId}/login/magic-link`)
        .set('Authorization', `Bearer ${parentToken}`);

      expect(issued.status).toBe(200);
      expect(issued.body.loginUrl).toMatch(/^http:\/\/test\.example\/login\?magic=/);
      expect(issued.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(typeof issued.body.expiresAt).toBe('string');
      expect(issued.body.token).toBeUndefined();
      expect(issued.body.temporaryPassword).toBeUndefined();

      const raw = new URL(issued.body.loginUrl as string).searchParams.get('magic');
      expect(raw).toBeTruthy();

      const stored = await database.collection('student_magic_tokens').find({}).toArray();
      expect(JSON.stringify(stored)).not.toContain(raw);

      const consumed = await request(app).post('/api/auth/student-magic').send({ token: raw });
      expect(consumed.status).toBe(200);
      expect(consumed.body.success).toBe(true);
      expect(consumed.body.user.role).toBe('student');
      expect(consumed.body.token).toBeDefined();

      const today = await request(app)
        .get('/api/studio/today')
        .set('Authorization', `Bearer ${consumed.body.token}`);
      expect(today.status).toBe(200);
    });

    it('student JWT cannot issue a magic link; reused and unknown tokens are 401', async () => {
      const studentIssue = await request(app)
        .post(`/api/students/${emmaId}/login/magic-link`)
        .set('Authorization', `Bearer ${emmaToken}`);
      expect(studentIssue.status).toBe(403);

      const issued = await request(app)
        .post(`/api/students/${emmaId}/login/magic-link`)
        .set('Authorization', `Bearer ${parentToken}`);
      const raw = new URL(issued.body.loginUrl as string).searchParams.get('magic');

      const first = await request(app).post('/api/auth/student-magic').send({ token: raw });
      expect(first.status).toBe(200);

      const reused = await request(app).post('/api/auth/student-magic').send({ token: raw });
      expect(reused.status).toBe(401);
      expect(reused.body.success).toBe(false);

      const unknown = await request(app)
        .post('/api/auth/student-magic')
        .send({ token: 'not-a-real-token' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error).toBe(reused.body.error);
    });

    it('returns 404 when the student has no login, 403 for another parent', async () => {
      const unbound = await new StudentRepository(database).create({
        userId: parentUserId,
        name: 'Unbound Magic',
        grade: 6,
      });
      const unboundId = unbound._id?.toString() ?? '';

      const missing = await request(app)
        .post(`/api/students/${unboundId}/login/magic-link`)
        .set('Authorization', `Bearer ${parentToken}`);
      expect(missing.status).toBe(404);

      const other = await authService.register(
        'magic.other.parent@example.com',
        'Password123!',
        'Other Parent'
      );
      if (!other.success || other.token === undefined) {
        throw new Error('Other parent register failed');
      }
      const stolen = await request(app)
        .post(`/api/students/${emmaId}/login/magic-link`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(stolen.status).toBe(403);
    });
  });
});
