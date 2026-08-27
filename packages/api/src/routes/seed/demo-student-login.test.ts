/**
 * Slice 4: demo seed creates Emma's student login; that JWT cannot list siblings.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { seedRouter } from './seed';
import { studentsRouter } from '../students/students';
import { studioRouter } from '../studio/studio';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA, DEMO_STUDENT_USER_LIAM } from './demo-data';

describe('Demo seed — student logins', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('demo-student-login');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example' })
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
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('seeds Emma as role=student scoped to her profile and forbids GET /api/students', async () => {
    const first = await request(app).post('/api/seed/demo');
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/seed/demo');
    expect(second.status).toBe(200);

    const emmaUsers = await database
      .collection('users')
      .find({ email: DEMO_STUDENT_USER_EMMA.email })
      .toArray();
    expect(emmaUsers).toHaveLength(1);
    expect(emmaUsers[0]?.['role']).toBe('student');

    const login = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    expect(login.success).toBe(true);
    expect(login.user?.role).toBe('student');
    expect(login.user?.studentId).toBeDefined();

    const decoded = await authService.verifyToken(login.token!);
    expect(decoded?.role).toBe('student');
    expect(decoded?.studentId).toBe(login.user?.studentId);

    const emmaProfile = await database.collection('students').findOne({
      studentId: 'demo-emma',
    });
    expect(emmaProfile?._id.toString()).toBe(login.user?.studentId);
    expect((emmaProfile?.['studentLogin'] as { userId?: string } | undefined)?.userId).toBe(
      login.user?.id
    );
    expect(
      (emmaProfile?.['studentLogin'] as { showGrades?: boolean } | undefined)?.showGrades
    ).toBe(false);

    const list = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${login.token}`);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe('FORBIDDEN');

    const parentLogin = await authService.login(DEMO_USER.email, DEMO_USER.password);
    expect(parentLogin.success).toBe(true);
    expect(
      (emmaProfile?.['studentLogin'] as { provisionedByUserId?: string } | undefined)
        ?.provisionedByUserId
    ).toBe(parentLogin.user?.id);
    const parentList = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${parentLogin.token}`);
    expect(parentList.status).toBe(200);
    const liam = (parentList.body as readonly { id: string; name: string }[]).find(
      (s) => s.name === 'Liam Mitchell'
    );
    expect(liam).toBeDefined();

    const liamAsEmma = await request(app)
      .get(`/api/students/${liam!.id}`)
      .set('Authorization', `Bearer ${login.token}`);
    expect(liamAsEmma.status).toBe(403);
  });

  it('seeds Liam as role=student scoped to his profile; he cannot read Emma’s studio pack', async () => {
    const seeded = await request(app).post('/api/seed/demo');
    expect(seeded.status).toBe(200);

    const liamUsers = await database
      .collection('users')
      .find({ email: DEMO_STUDENT_USER_LIAM.email })
      .toArray();
    expect(liamUsers).toHaveLength(1);
    expect(liamUsers[0]?.['role']).toBe('student');
    expect(liamUsers[0]?.['isSuspended']).not.toBe(true);

    const login = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    expect(login.success).toBe(true);
    expect(login.user?.role).toBe('student');
    expect(login.user?.studentId).toBeDefined();

    const liamProfile = await database.collection('students').findOne({
      studentId: 'demo-liam',
    });
    expect(liamProfile?._id.toString()).toBe(login.user?.studentId);
    expect((liamProfile?.['studentLogin'] as { userId?: string } | undefined)?.userId).toBe(
      login.user?.id
    );
    expect(
      (liamProfile?.['studentLogin'] as { showGrades?: boolean } | undefined)?.showGrades
    ).toBe(false);

    const list = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${login.token}`);
    expect(list.status).toBe(403);

    const emmaPack = await request(app)
      .get('/api/studio/assignments/demo-emma-ap-bio-a5')
      .set('Authorization', `Bearer ${login.token}`);
    expect(emmaPack.status).toBe(404);

    const ownPack = await request(app)
      .get('/api/studio/assignments/demo-liam-math7-a0')
      .set('Authorization', `Bearer ${login.token}`);
    expect(ownPack.status).toBe(200);
    expect(ownPack.body.title).toBeDefined();
  });

  it('re-seed unsuspends Liam and restores the demo password', async () => {
    await request(app).post('/api/seed/demo');
    const liamUser = await database.collection('users').findOne({
      email: DEMO_STUDENT_USER_LIAM.email,
    });
    expect(liamUser?._id).toBeDefined();
    await database
      .collection('users')
      .updateOne(
        { _id: liamUser!._id },
        { $set: { isSuspended: true, suspendedReason: 'student_login_revoked' } }
      );
    await database
      .collection('students')
      .updateOne({ studentId: 'demo-liam' }, { $unset: { studentLogin: '' } });

    const blocked = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    expect(blocked.success).toBe(false);

    const again = await request(app).post('/api/seed/demo');
    expect(again.status).toBe(200);

    const restored = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    expect(restored.success).toBe(true);
    expect(restored.user?.role).toBe('student');
  });
});
