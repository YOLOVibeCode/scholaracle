/**
 * Contract tests for POST /api/auth/login and /api/auth/refresh — the shapes
 * mobile's token storage depends on. Pins exact key sets.
 *
 * Wire types: @scholaracle/contracts types/api/auth.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { PasswordResetTokenRepository, RefreshTokenRepository } from '@scholaracle/database';
import { authRouter } from '../routes/auth/auth';
import { createErrorHandler } from '../middleware/errorHandler';
import { assertKeys } from './assertExactKeys';

const EMAIL = 'contract-auth@example.com';

describe('auth API contract', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await database.collection('users').deleteMany({ email: EMAIL });

    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        passwordResetTokenStore: new PasswordResetTokenRepository(database),
        passwordResetEmailSender: { sendResetLink: async (): Promise<void> => {} },
        baseUrl: 'http://localhost:2800',
        refreshTokenStore: new RefreshTokenRepository(database),
        refreshTokenExpiresIn: '30d',
      })
    );
    app.use(createErrorHandler());

    const register = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL, password: 'password123', name: 'Auth Contract' });
    if (register.status !== 200 && register.status !== 201) {
      throw new Error(`register failed: ${register.status}`);
    }
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  it('POST /api/auth/login — success body has the exact wire keys', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'password123' });

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'token'],
      ['refreshToken', 'familyId', 'rememberMe', 'user', 'forcePasswordReset', 'error'],
      'IAuthLoginResponse'
    );
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    assertKeys(
      res.body.user as Record<string, unknown>,
      ['id', 'email', 'name'],
      [],
      'IAuthLoginResponse.user'
    );
  });

  it('POST /api/auth/refresh — success body has the exact wire keys', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'password123' });
    const refreshToken = login.body.refreshToken as string;
    expect(refreshToken).toBeDefined();

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'token', 'refreshToken', 'rememberMe'],
      [],
      'IAuthRefreshResponse'
    );
    expect(res.body.success).toBe(true);
  });

  it('login failure — standard error envelope with success:false', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    // Login failure passes through IAuthResult (success/error), not the
    // thrown-error envelope — pin that shape too.
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'error'],
      ['code', 'requestId'],
      'login failure body'
    );
    expect(res.body.success).toBe(false);
  });

  it('validation failure — thrown-error envelope (error, code, requestId)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL });

    expect(res.status).toBe(400);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'error', 'code'],
      ['requestId', 'details', 'debug'],
      'IErrorResponseBody'
    );
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
