/**
 * SOURCE_INVITE.md §6
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import {
  SOURCE_INVITE_ISSUE_RESPONSE_KEYS,
  SOURCE_INVITE_REDEEM_ERROR,
} from '@scholaracle/contracts';
import { StudentRepository, SourceInviteRepository } from '@scholaracle/database';
import { createErrorHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/auth';
import { MemoryRateLimiter } from '../../middleware/rateLimit';
import { SystemClock } from '../../services/source-invite/clock';
import { InstallLandingRenderer } from '../../services/source-invite/InstallLandingRenderer';
import { SourceInviteService } from '../../services/source-invite/SourceInviteService';
import { StudentRepositoryOwnerLookup } from '../../services/source-invite/studentOwnerLookup';
import { CryptoTokenGenerator, Sha256TokenHasher } from '../../services/source-invite/tokens';
import type { ISourceInviteMailer } from '../../services/source-invite/SourceInviteEmailSender';
import { installSourceRouter, sourceInvitesRouter } from './source-invites';

describe('source-invites HTTP', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let userToken: string;
  let otherToken: string;
  let studentId: string;
  let mailer: { sendInstallLink: jest.Mock };
  let limiter: MemoryRateLimiter;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db('scholaracle_source_invite_http_test');
    authService = new AuthService(database, 'test-secret');
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('students').deleteMany({});
    await database.collection('source_invites').deleteMany({});

    const a = await authService.register('parent@example.com', 'password123', 'Parent A');
    if (!a.success || !a.token || !a.user) throw new Error('register A failed');
    userToken = a.token;
    const b = await authService.register('other@example.com', 'password123', 'Parent B');
    if (!b.success || !b.token) throw new Error('register B failed');
    otherToken = b.token;

    const students = new StudentRepository(database);
    const created = await students.create({
      userId: a.user.id,
      name: 'Ava Lewis',
      studentId: 'ava-lewis',
    });
    studentId = created._id!.toString();

    mailer = { sendInstallLink: jest.fn().mockResolvedValue(undefined) };
    limiter = new MemoryRateLimiter();
    const store = new SourceInviteRepository(database);
    const service = new SourceInviteService(
      store,
      new SystemClock(),
      new CryptoTokenGenerator(),
      new Sha256TokenHasher(),
      new StudentRepositoryOwnerLookup(students)
    );
    const config = {
      issuer: service,
      redeemer: service,
      mailer: mailer as unknown as ISourceInviteMailer,
      landing: new InstallLandingRenderer(),
      apiPublicOrigin: 'https://api.example.com',
      webOrigin: 'https://app.example.com',
      limiter,
    };

    app = express();
    app.use(express.json());
    app.use('/api/source-invites', authMiddleware(authService), sourceInvitesRouter(config));
    app.use('/install-source', installSourceRouter(config));
    app.use(createErrorHandler());
  });

  it('unauthenticated issue/redeem → 401', async () => {
    await request(app)
      .post('/api/source-invites')
      .send({ studentId, provider: 'skyward', portalBaseUrl: 'https://skyward.iscorp.com' })
      .expect(401);
    await request(app)
      .post('/api/source-invites/redeem')
      .send({ token: 'ab'.repeat(32) })
      .expect(401);
  });

  it('issue body with to → 400', async () => {
    const res = await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        to: 'victim@x.com',
        studentId,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      });
    expect(res.status).toBe(400);
  });

  it('issue body with password → 400', async () => {
    const res = await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        studentId,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
        password: 'secret',
      });
    expect(res.status).toBe(400);
  });

  it('happy issue → 200 exact keys; mailer got landing URL; JSON has no raw token', async () => {
    const res = await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        studentId,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...SOURCE_INVITE_ISSUE_RESPONSE_KEYS].sort());
    expect(res.body.emailedTo).toBe('parent@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/"token"/);
    expect(mailer.sendInstallLink).toHaveBeenCalledTimes(1);
    const mailArg = mailer.sendInstallLink.mock.calls[0]?.[0] as { landingUrl: string };
    expect(mailArg.landingUrl).toMatch(
      /^https:\/\/api\.example\.com\/install-source\?t=[a-f0-9]{64}$/
    );
    expect(mailArg.landingUrl).not.toContain('password');
  });

  it('redeem happy → Ava portal URL', async () => {
    await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        studentId,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      })
      .expect(200);
    const mailArg = mailer.sendInstallLink.mock.calls[0]?.[0] as { landingUrl: string };
    const token = mailArg.landingUrl.split('t=')[1] ?? '';
    const redeem = await request(app)
      .post('/api/source-invites/redeem')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ token });
    expect(redeem.status).toBe(200);
    expect(redeem.body.invite.portalBaseUrl).toBe('https://skyward.iscorp.com');
    expect(redeem.body.invite.provider).toBe('skyward');
  });

  it('redeem as other user → 404 generic error string', async () => {
    await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        studentId,
        provider: 'skyward',
        portalBaseUrl: 'https://skyward.iscorp.com',
      })
      .expect(200);
    const mailArg = mailer.sendInstallLink.mock.calls[0]?.[0] as { landingUrl: string };
    const token = mailArg.landingUrl.split('t=')[1] ?? '';
    const redeem = await request(app)
      .post('/api/source-invites/redeem')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ token });
    expect(redeem.status).toBe(404);
    expect(redeem.body.error).toBe(SOURCE_INVITE_REDEEM_ERROR);
  });

  it('rate limit 6th issue → 429', async () => {
    const body = {
      studentId,
      provider: 'skyward',
      portalBaseUrl: 'https://skyward.iscorp.com',
    };
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post('/api/source-invites')
        .set('Authorization', `Bearer ${userToken}`)
        .send(body);
      expect(res.status).toBe(200);
    }
    const sixth = await request(app)
      .post('/api/source-invites')
      .set('Authorization', `Bearer ${userToken}`)
      .send(body);
    expect(sixth.status).toBe(429);
  });
});

describe('GET /install-source', () => {
  const landing = new InstallLandingRenderer();
  const app = express();
  app.use(
    '/install-source',
    installSourceRouter({
      issuer: {} as never,
      redeemer: {} as never,
      mailer: { sendInstallLink: async (): Promise<void> => undefined },
      landing,
      apiPublicOrigin: 'https://api.example.com',
      webOrigin: 'https://app.example.com',
    })
  );

  const hex = 'ab'.repeat(32);

  it('GET without t → 200 html with both links', async () => {
    const res = await request(app).get('/install-source');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('scholarmancy://install-source');
    expect(res.text).toContain('/dashboard/install-source');
  });

  it('GET with 64 hex → both hrefs contain that hex only as t', async () => {
    const res = await request(app).get(`/install-source?t=${hex}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`scholarmancy://install-source?t=${hex}`);
    expect(res.text).toContain(`https://app.example.com/dashboard/install-source?t=${hex}`);
  });

  it('GET with script → 200, html does not contain script', async () => {
    const res = await request(app).get('/install-source?t=<script>alert(1)</script>');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).not.toContain('script');
  });

  it('html does not contain password or iscorp', async () => {
    const res = await request(app).get(`/install-source?t=${hex}`);
    expect(res.text.toLowerCase()).not.toContain('password');
    expect(res.text).not.toContain('iscorp');
  });
});
