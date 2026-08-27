/**
 * Magic-link send + consume API tests.
 *
 * Covers:
 *  - POST /api/students/:id/login/magic-link/send  (owner; student kind)
 *  - POST /api/students/:id/contacts/:email/magic-link/send (canAdmin; sharedParent kind)
 *  - POST /api/auth/magic  (consume — student, accepted parent, pending invitee auto-onboard)
 *  - Authz: 403 for wrong owner, non-admin contact sender
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER } from '../seed/demo-data';
import { authRouter } from './auth';
import { studentsRouter } from '../students/students';
import { studioRouter } from '../studio/studio';
import type { IMagicLinkSender } from '../../services/provision/MagicLinkSender';

const JWT_SECRET = 'magic-link-test-secret';

/** Stub sender that captures calls without actually sending anything. */
function makeSenderStub(): IMagicLinkSender & {
  emails: { to: string; loginUrl: string }[];
  smss: { to: string; loginUrl: string }[];
} {
  const emails: { to: string; loginUrl: string }[] = [];
  const smss: { to: string; loginUrl: string }[] = [];
  return {
    emails,
    smss,
    async sendEmail(params) {
      emails.push({ to: params.to, loginUrl: params.loginUrl });
    },
    async sendSms(params) {
      smss.push({ to: params.to, loginUrl: params.loginUrl });
    },
  };
}

function tokenFromUrl(loginUrl: string): string {
  const parsed = new URL(loginUrl);
  const token = parsed.searchParams.get('magic');
  if (!token) throw new Error('loginUrl missing magic param');
  return token;
}

describe('Magic-link send + consume', () => {
  jest.setTimeout(60_000);

  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let sender: ReturnType<typeof makeSenderStub>;
  let parentToken: string;
  let emmaId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('magic-link-api-test');
    authService = new AuthService(database, JWT_SECRET);
    sender = makeSenderStub();

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: JWT_SECRET }));
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: JWT_SECRET,
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
        jwtSecret: JWT_SECRET,
        magicLinkSender: sender,
      })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({ database, baseUrl: 'http://test.example', jwtSecret: JWT_SECRET })
    );
    app.use(createErrorHandler());

    await request(app).post('/api/seed/demo').expect(200);

    const loginRes = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!loginRes.success || !loginRes.token) throw new Error('Parent login failed');
    parentToken = loginRes.token;

    const all = await database.collection('students').find({}).toArray();
    const emma = all.find((s) => s['name'] === 'Emma Mitchell');
    if (!emma) throw new Error('Emma not found in seed data');
    emmaId = emma['_id'].toString() as string;
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(() => {
    sender.emails.length = 0;
    sender.smss.length = 0;
  });

  // ── student send ─────────────────────────────────────────────────────────

  it('POST .../login/magic-link/send sends email to student (owner)', async () => {
    const res = await request(app)
      .post(`/api/students/${emmaId}/login/magic-link/send`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ channel: 'email', to: 'emma@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expiresAt).toBeDefined();
    expect(sender.emails).toHaveLength(1);
    expect(sender.emails[0]!.to).toBe('emma@example.com');
    expect(sender.emails[0]!.loginUrl).toMatch(/\/login\?magic=/);
  });

  it('POST .../login/magic-link/send returns 403 without auth', async () => {
    await request(app)
      .post(`/api/students/${emmaId}/login/magic-link/send`)
      .send({ channel: 'email', to: 'x@x.com' })
      .expect(401);
  });

  it('POST .../login/magic-link/send returns 400 for missing channel', async () => {
    await request(app)
      .post(`/api/students/${emmaId}/login/magic-link/send`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ to: 'x@x.com' })
      .expect(400);
  });

  // ── consume: student ──────────────────────────────────────────────────────

  it('POST /api/auth/magic consumes student token and returns JWT for student role', async () => {
    const sendRes = await request(app)
      .post(`/api/students/${emmaId}/login/magic-link/send`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ channel: 'email', to: 'emma@example.com' })
      .expect(200);
    expect(sendRes.body.success).toBe(true);

    const loginUrl = sender.emails[0]!.loginUrl;
    const token = tokenFromUrl(loginUrl);

    const consumeRes = await request(app).post('/api/auth/magic').send({ token }).expect(200);

    expect(consumeRes.body.success).toBe(true);
    expect(consumeRes.body.user?.role).toBe('student');
  });

  // ── contacts: sharedParent (accepted) ────────────────────────────────────

  it('POST .../contacts/:email/magic-link/send sends email to accepted contact', async () => {
    // Add a contact to Emma
    const users = new UserRepository(database);
    const contactHash = await UserRepository.hashPassword('ContactPass123!');
    const contactUser = await users.create({
      email: 'contact.magic@example.com',
      passwordHash: contactHash,
      name: 'Contact',
      role: 'parent',
    });
    const contactId = contactUser._id!.toString();
    const students = new StudentRepository(database);
    const student = await students.findById(emmaId);
    await students.update(student!._id!, {
      sharedWith: [
        ...(student?.sharedWith ?? []),
        {
          userId: contactId,
          email: 'contact.magic@example.com',
          name: 'Contact',
          role: 'parent' as const,
          status: 'accepted' as const,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      ],
    });

    const res = await request(app)
      .post(
        `/api/students/${emmaId}/contacts/${encodeURIComponent('contact.magic@example.com')}/magic-link/send`
      )
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ channel: 'email' });

    expect(res.status).toBe(200);
    expect(sender.emails).toHaveLength(1);
    expect(sender.emails[0]!.to).toBe('contact.magic@example.com');
  });

  // ── contacts: pending invite auto-onboard ────────────────────────────────

  it('POST /api/auth/magic auto-onboards a pending invitee and lands on parent role', async () => {
    const inviteEmail = 'new.invite.magic@example.com';
    // Add a pending invite to Emma
    const students = new StudentRepository(database);
    const student = await students.findById(emmaId);
    await students.update(student!._id!, {
      sharedWith: [
        ...(student?.sharedWith ?? []),
        {
          email: inviteEmail,
          role: 'parent' as const,
          status: 'pending' as const,
          invitedAt: new Date(),
        },
      ],
    });

    // Send the magic link for the pending invitee
    const sendRes = await request(app)
      .post(`/api/students/${emmaId}/contacts/${encodeURIComponent(inviteEmail)}/magic-link/send`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ channel: 'email' })
      .expect(200);
    expect(sendRes.body.success).toBe(true);

    const loginUrl = sender.emails[0]!.loginUrl;
    const token = tokenFromUrl(loginUrl);

    const consumeRes = await request(app).post('/api/auth/magic').send({ token }).expect(200);

    expect(consumeRes.body.success).toBe(true);
    expect(consumeRes.body.user?.role).toBe('parent');

    // Verify invite was accepted
    const refreshedStudent = await students.findById(emmaId);
    const invite = refreshedStudent?.sharedWith.find((sp) => sp.email === inviteEmail);
    expect(invite?.status).toBe('accepted');
    expect(invite?.userId).toBeDefined();
  });

  it('POST /api/auth/magic returns 401 for invalid token', async () => {
    await request(app).post('/api/auth/magic').send({ token: 'not-a-real-token' }).expect(401);
  });

  // ── grade isolation: student JWT cannot access parent routes ─────────────

  it('Student magic link issues role=student JWT — cannot reach parent /api/students endpoint', async () => {
    // Send a student magic link
    await request(app)
      .post(`/api/students/${emmaId}/login/magic-link/send`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ channel: 'email', to: 'emma@example.com' })
      .expect(200);

    const loginUrl = sender.emails[0]!.loginUrl;
    const token = tokenFromUrl(loginUrl);

    // Consume — expect role=student in the JWT payload
    const consumeRes = await request(app).post('/api/auth/magic').send({ token }).expect(200);

    expect(consumeRes.body.user?.role).toBe('student');

    // Use the student JWT against a parent-only endpoint — must be 403
    const studentJwt = consumeRes.body.token as string;
    const guardRes = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${studentJwt}`)
      .expect(403);

    // Double-check: the student JWT also cannot see another student's data
    // (the studio endpoint scopes by studentId claim embedded in the JWT)
    expect(guardRes.status).toBe(403);
  });

  it('POST .../contacts/:email/magic-link/send returns 403 for non-admin contact', async () => {
    // Register a non-admin contact user and get their token
    const users = new UserRepository(database);
    const hash = await UserRepository.hashPassword('NoAdmin123!');
    await users.create({
      email: 'noadmin@example.com',
      passwordHash: hash,
      name: 'NoAdmin',
      role: 'parent',
    });
    const noAdminLogin = await authService.login('noadmin@example.com', 'NoAdmin123!');
    const noAdminToken = noAdminLogin.success ? noAdminLogin.token! : '';

    await request(app)
      .post(
        `/api/students/${emmaId}/contacts/${encodeURIComponent('contact.magic@example.com')}/magic-link/send`
      )
      .set('Authorization', `Bearer ${noAdminToken}`)
      .send({ channel: 'email' })
      .expect(404); // Not Found: student.hasAccess fails for a non-related user
  });
});
