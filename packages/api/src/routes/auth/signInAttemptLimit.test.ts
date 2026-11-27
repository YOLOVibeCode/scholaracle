import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import type { AuthService } from '@scholaracle/auth';
import { RefreshTokenRepository } from '@scholaracle/database';
import { authRouter, type IAuthRouterConfig } from './auth';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { ISignInLimits } from './signInAttemptGuard';

const PASSWORD = 'right-password-123';
const HOME = '198.51.100.10';
const ELSEWHERE = '198.51.100.20';
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const SMALL_LIMITS: ISignInLimits = {
  perAccountAndAddress: { maxFailures: 3, windowMs: FIFTEEN_MINUTES_MS },
  perAddress: { maxFailures: 5, windowMs: FIFTEEN_MINUTES_MS },
};

// Each test hashes and checks real passwords a dozen times; a loaded CI runner needs the room.
jest.setTimeout(30_000);

describe('POST /api/auth/login: limit on failed sign-ins', () => {
  let database: Db;
  let mongoClient: MongoClient;

  /** A fresh app per test, so one test's failed sign-ins are not counted in the next. */
  function buildApp(overrides: Partial<IAuthRouterConfig> = {}): Express {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        refreshTokenStore: new RefreshTokenRepository(database),
        refreshTokenExpiresIn: '30d',
        ...overrides,
      })
    );
    app.use(createErrorHandler());
    return app;
  }

  async function register(app: Express, email: string): Promise<void> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, name: 'Limit Test' });
    expect(res.status).toBe(201);
  }

  function signIn(app: Express, email: string, password: string, address: string): request.Test {
    return request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', address)
      .send({ email, password });
  }

  beforeAll(async () => {
    mongoClient = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await mongoClient.connect();
    database = mongoClient.db(process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test');
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({ email: /@signin-limit\.test$/ });
  });

  it('answers 429 to the right password once ten wrong ones have been tried from that address', async () => {
    const app = buildApp();
    await register(app, 'ten@signin-limit.test');

    for (let i = 0; i < 10; i += 1) {
      const wrong = await signIn(app, 'ten@signin-limit.test', `wrong-${i}`, HOME);
      expect(wrong.status).toBe(401);
    }
    const eleventh = await signIn(app, 'ten@signin-limit.test', PASSWORD, HOME);

    expect(eleventh.status).toBe(429);
    expect(eleventh.body.success).toBe(false);
    expect(eleventh.body.code).toBe('RATE_LIMITED');
    expect(eleventh.body.error).toBe('Too many sign-in attempts. Try again in 15 minutes.');
    expect(eleventh.body.token).toBeUndefined();
    expect(eleventh.headers['set-cookie']).toBeUndefined();
    expect(Number(eleventh.headers['retry-after'])).toBeGreaterThan(14 * 60);
    expect(Number(eleventh.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
  });

  it("still signs the account's owner in from another address", async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'owner@signin-limit.test');
    for (let i = 0; i < 3; i += 1) await signIn(app, 'owner@signin-limit.test', 'wrong', ELSEWHERE);
    expect((await signIn(app, 'owner@signin-limit.test', PASSWORD, ELSEWHERE)).status).toBe(429);

    const fromHome = await signIn(app, 'owner@signin-limit.test', PASSWORD, HOME);

    expect(fromHome.status).toBe(200);
    expect(fromHome.body.token).toBeTruthy();
  });

  it('starts counting afresh after a sign-in that worked', async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'typo@signin-limit.test');
    await signIn(app, 'typo@signin-limit.test', 'wrong', HOME);
    await signIn(app, 'typo@signin-limit.test', 'wrong', HOME);
    expect((await signIn(app, 'typo@signin-limit.test', PASSWORD, HOME)).status).toBe(200);

    const afterwards = [
      await signIn(app, 'typo@signin-limit.test', 'wrong', HOME),
      await signIn(app, 'typo@signin-limit.test', 'wrong', HOME),
      await signIn(app, 'typo@signin-limit.test', 'wrong', HOME),
    ];

    expect(afterwards.map((r) => r.status)).toEqual([401, 401, 401]);
  });

  it('counts an email the same whatever its case', async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'case@signin-limit.test');
    await signIn(app, 'CASE@signin-limit.test', 'wrong', HOME);
    await signIn(app, 'Case@Signin-Limit.test', 'wrong', HOME);
    await signIn(app, 'case@signin-limit.test', 'wrong', HOME);

    expect((await signIn(app, 'case@signin-limit.test', PASSWORD, HOME)).status).toBe(429);
  });

  it('refuses an address that fails with many accounts, for accounts it has not tried too', async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'untouched@signin-limit.test');
    for (let i = 0; i < 5; i += 1) {
      const res = await signIn(app, `nobody-${i}@signin-limit.test`, 'guess', ELSEWHERE);
      expect(res.status).toBe(401);
    }

    const fromThatAddress = await signIn(app, 'untouched@signin-limit.test', PASSWORD, ELSEWHERE);
    const fromHome = await signIn(app, 'untouched@signin-limit.test', PASSWORD, HOME);

    expect(fromThatAddress.status).toBe(429);
    expect(fromHome.status).toBe(200);
  });

  it('does not check the password of a refused sign-in', async () => {
    const seen: string[] = [];
    const app = buildApp({
      signInLimits: SMALL_LIMITS,
      beforeLogin: async (_email, password): Promise<void> => {
        seen.push(password);
      },
    });
    await register(app, 'unchecked@signin-limit.test');
    for (let i = 0; i < 3; i += 1)
      await signIn(app, 'unchecked@signin-limit.test', `wrong-${i}`, HOME);

    const refused = await signIn(app, 'unchecked@signin-limit.test', PASSWORD, HOME);

    expect(refused.status).toBe(429);
    expect(seen).toEqual(['wrong-0', 'wrong-1', 'wrong-2']);
  });

  it('checks at most the allowed number of sign-ins sent at the same moment', async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'burst@signin-limit.test');

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        signIn(app, 'burst@signin-limit.test', `guess-${i}`, HOME)
      )
    );
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 401)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(9);
  });

  it('does not count a request that is missing its email or password', async () => {
    const app = buildApp({ signInLimits: SMALL_LIMITS });
    await register(app, 'missing@signin-limit.test');
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', HOME)
        .send({ email: 'missing@signin-limit.test' });
      expect(res.status).toBe(400);
    }

    expect((await signIn(app, 'missing@signin-limit.test', PASSWORD, HOME)).status).toBe(200);
  });

  it('does not count a sign-in that could not be checked', async () => {
    const outage = {
      login: async (): Promise<{ success: false; error: string }> => ({
        success: false,
        error: 'connection lost',
      }),
    } as unknown as AuthService;
    const app = buildApp({ signInLimits: SMALL_LIMITS, authService: outage });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await signIn(app, 'outage@signin-limit.test', PASSWORD, HOME)).status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it('does not count a sign-in that ended in a server error', async () => {
    const broken = {
      login: async (): Promise<never> => {
        throw new Error('boom');
      },
    } as unknown as AuthService;
    const app = buildApp({ signInLimits: SMALL_LIMITS, authService: broken });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await signIn(app, 'broken@signin-limit.test', PASSWORD, HOME)).status);
    }

    expect(statuses).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it('sets no limit when the router is told to have none', async () => {
    const app = buildApp({ signInLimits: false });
    await register(app, 'nolimit@signin-limit.test');
    for (let i = 0; i < 12; i += 1) {
      expect((await signIn(app, 'nolimit@signin-limit.test', 'wrong', HOME)).status).toBe(401);
    }

    expect((await signIn(app, 'nolimit@signin-limit.test', PASSWORD, HOME)).status).toBe(200);
  });
});
