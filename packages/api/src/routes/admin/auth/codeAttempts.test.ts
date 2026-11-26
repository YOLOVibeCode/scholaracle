import request from 'supertest';
import express, { type Express } from 'express';
import speakeasy from 'speakeasy';
import { MongoClient, type Db } from 'mongodb';
import { AdminStepUpChallengeRepository } from '@scholaracle/database';
import { adminAuthRouter } from './auth';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

const PASSWORD = 'CodeAttempts123!';

/** A six-digit code that is not valid for `secret` now or in the steps the server accepts. */
function wrongCodeFor(secret: string): string {
  const valid = new Set<string>();
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (let step = -4; step <= 4; step += 1) {
    valid.add(speakeasy.totp({ secret, encoding: 'base32', time: nowSeconds + step * 30 }));
  }
  let candidate = 0;
  while (valid.has(String(candidate).padStart(6, '0'))) candidate += 1;
  return String(candidate).padStart(6, '0');
}

function rightCodeFor(secret: string): string {
  return speakeasy.totp({ secret, encoding: 'base32' });
}

describe('Admin auth routes: tries at the authenticator code', () => {
  let client: MongoClient;
  let database: Db;

  /** A fresh app per test, so one test's wrong codes are not counted in the next. */
  function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/admin/auth',
      adminAuthRouter({
        database,
        jwtSecret: 'test-secret',
        stepUpChallengeStore: new AdminStepUpChallengeRepository(database),
      })
    );
    app.use(createErrorHandler());
    return app;
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({ email: /@code-attempts-route\.test$/ });
  });

  it('POST /mfa/verify answers 429 to the right code after five wrong ones', async () => {
    const app = buildApp();
    const email = 'signin@code-attempts-route.test';
    const { mfaSecret } = await createTestAdmin(database, 'test-secret', {
      email,
      password: PASSWORD,
      name: 'Sign-in Codes',
      role: 'admin',
    });
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email, password: PASSWORD });
    const mfaToken = login.body.mfaToken as string;
    expect(mfaToken).toBeTruthy();

    for (let i = 0; i < 5; i += 1) {
      const wrong = await request(app)
        .post('/api/admin/auth/mfa/verify')
        .send({ mfaToken, token: wrongCodeFor(mfaSecret) });
      expect(wrong.status).toBe(401);
      expect(wrong.body.code).toBe('UNAUTHENTICATED');
    }

    const sixth = await request(app)
      .post('/api/admin/auth/mfa/verify')
      .send({ mfaToken, token: rightCodeFor(mfaSecret) });

    expect(sixth.status).toBe(429);
    expect(sixth.body.success).toBe(false);
    expect(sixth.body.code).toBe('RATE_LIMITED');
    expect(sixth.body.token).toBeUndefined();
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(sixth.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
  });

  it('POST /step-up/verify answers 429 to the right code after five wrong ones', async () => {
    const app = buildApp();
    const { token: adminToken, mfaSecret } = await createTestAdmin(database, 'test-secret', {
      email: 'stepup@code-attempts-route.test',
      password: PASSWORD,
      name: 'Step-up Codes',
      role: 'admin',
    });
    const start = await request(app)
      .post('/api/admin/auth/step-up/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const stepUpId = start.body.data.stepUpId as string;

    for (let i = 0; i < 5; i += 1) {
      const wrong = await request(app)
        .post('/api/admin/auth/step-up/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stepUpId, token: wrongCodeFor(mfaSecret) });
      expect(wrong.status).toBe(401);
    }

    const sixth = await request(app)
      .post('/api/admin/auth/step-up/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepUpId, token: rightCodeFor(mfaSecret) });

    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('RATE_LIMITED');
    expect(sixth.body.data?.stepUpToken).toBeUndefined();
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('POST /step-up/verify still mints a step-up token for the right code after a wrong one', async () => {
    const app = buildApp();
    const { token: adminToken, mfaSecret } = await createTestAdmin(database, 'test-secret', {
      email: 'stepup-ok@code-attempts-route.test',
      password: PASSWORD,
      name: 'Step-up Works',
      role: 'admin',
    });
    const start = await request(app)
      .post('/api/admin/auth/step-up/start')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const stepUpId = start.body.data.stepUpId as string;

    const wrong = await request(app)
      .post('/api/admin/auth/step-up/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepUpId, token: wrongCodeFor(mfaSecret) });
    expect(wrong.status).toBe(401);

    const right = await request(app)
      .post('/api/admin/auth/step-up/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepUpId, token: rightCodeFor(mfaSecret) });

    expect(right.status).toBe(200);
    expect(right.body.data?.stepUpToken).toBeTruthy();
  });
});
