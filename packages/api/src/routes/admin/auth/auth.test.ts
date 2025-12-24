import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { adminAuthRouter } from './auth';
import { AdminUserRepository } from '@scholaracle/database';
import { MFAService } from '@scholaracle/auth';

describe('Admin Auth Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let mfaService: MFAService;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    mfaService = new MFAService();

    app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({});
  });

  describe('POST /api/admin/auth/login', () => {
    it('should login successfully', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('LoginPass123!');
      await new AdminUserRepository(database).create({
        email: 'login@test.com',
        passwordHash,
        name: 'Login Admin',
        role: 'admin',
      });

      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'login@test.com',
          password: 'LoginPass123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.admin).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'invalid@test.com',
          password: 'WrongPass123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should require MFA when enabled', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('MFAPass123!');
      const admin = await new AdminUserRepository(database).create({
        email: 'mfa@test.com',
        passwordHash,
        name: 'MFA Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('mfa@test.com');
      await new AdminUserRepository(database).update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      const response = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'mfa@test.com',
          password: 'MFAPass123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.requiresMFA).toBe(true);
      expect(response.body.mfaToken).toBeDefined();
    });

    it('should rate limit login when enabled', async () => {
      const old = process.env['RATE_LIMIT_ENABLED'];
      process.env['RATE_LIMIT_ENABLED'] = 'true';
      try {
        // Fresh app instance to pick up env + limiter.
        const app2 = express();
        app2.use(express.json());
        app2.use('/api/admin/auth', adminAuthRouter({ database, jwtSecret: 'test-secret' }));

        // Make sure user exists; password irrelevant (we just need deterministic route calls).
        const passwordHash = await AdminUserRepository.hashPassword('LoginPass123!');
        await new AdminUserRepository(database).create({
          email: 'ratelimit@test.com',
          passwordHash,
          name: 'Rate Limit Admin',
          role: 'admin',
        });

        // 10 allowed, 11th should 429
        for (let i = 0; i < 10; i++) {
          await request(app2).post('/api/admin/auth/login').send({ email: 'ratelimit@test.com', password: 'wrong' });
        }
        const res = await request(app2).post('/api/admin/auth/login').send({ email: 'ratelimit@test.com', password: 'wrong' });
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        if (old === undefined) delete process.env['RATE_LIMIT_ENABLED'];
        else process.env['RATE_LIMIT_ENABLED'] = old;
      }
    });
  });

  describe('POST /api/admin/auth/mfa/verify', () => {
    it('should verify valid MFA token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('MFAPass123!');
      const admin = await new AdminUserRepository(database).create({
        email: 'mfaverify@test.com',
        passwordHash,
        name: 'MFA Verify Admin',
        role: 'admin',
      });

      const { secret } = mfaService.generateSecret('mfaverify@test.com');
      await new AdminUserRepository(database).update(admin._id!.toString(), {
        mfaEnabled: true,
        mfaSecret: secret,
      });

      // Login to get MFA token
      const loginResponse = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'mfaverify@test.com',
          password: 'MFAPass123!',
        });

      expect(loginResponse.body.requiresMFA).toBe(true);
      const mfaToken = loginResponse.body.mfaToken;

      // Generate valid TOTP token
      const speakeasy = require('speakeasy');
      const totpToken = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const verifyResponse = await request(app)
        .post('/api/admin/auth/mfa/verify')
        .send({
          mfaToken,
          token: totpToken,
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.token).toBeDefined();
    });

    it('should reject invalid MFA token', async () => {
      const response = await request(app)
        .post('/api/admin/auth/mfa/verify')
        .send({
          mfaToken: 'invalid-token',
          token: '000000',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Step-up MFA', () => {
    it('should enable MFA and mint step-up token', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('StepUpPass123!');
      await new AdminUserRepository(database).create({
        email: 'stepup@test.com',
        passwordHash,
        name: 'Step Up Admin',
        role: 'admin',
      });

      // Login (no MFA yet)
      const loginRes = await request(app).post('/api/admin/auth/login').send({
        email: 'stepup@test.com',
        password: 'StepUpPass123!',
      });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token as string;
      expect(adminToken).toBeTruthy();

      // Setup MFA (client would normally call /mfa/setup)
      const { secret } = mfaService.generateSecret('stepup@test.com');
      const speakeasy = require('speakeasy');
      const totp = speakeasy.totp({ secret, encoding: 'base32' });

      const enableRes = await request(app)
        .post('/api/admin/auth/mfa/enable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ secret, token: totp });
      expect(enableRes.status).toBe(200);
      expect(enableRes.body.success).toBe(true);

      const startRes = await request(app)
        .post('/api/admin/auth/step-up/start')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(startRes.status).toBe(200);
      expect(startRes.body.success).toBe(true);
      expect(startRes.body.data?.stepUpId).toBeTruthy();

      const stepUpId = startRes.body.data.stepUpId as string;
      const totp2 = speakeasy.totp({ secret, encoding: 'base32' });
      const verifyRes = await request(app)
        .post('/api/admin/auth/step-up/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stepUpId, token: totp2 });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data?.stepUpToken).toBeTruthy();
    });
  });

  describe('POST /api/admin/auth/logout', () => {
    it('should logout successfully', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('LogoutPass123!');
      await new AdminUserRepository(database).create({
        email: 'logout@test.com',
        passwordHash,
        name: 'Logout Admin',
        role: 'admin',
      });

      const loginResponse = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'logout@test.com',
          password: 'LogoutPass123!',
        });

      const token = loginResponse.body.token;

      const logoutResponse = await request(app)
        .post('/api/admin/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
    });
  });

  describe('POST /api/admin/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('RefreshPass123!');
      await new AdminUserRepository(database).create({
        email: 'refresh@test.com',
        passwordHash,
        name: 'Refresh Admin',
        role: 'admin',
      });

      const loginResponse = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'refresh@test.com',
          password: 'RefreshPass123!',
        });

      const token = loginResponse.body.token;

      const refreshResponse = await request(app)
        .post('/api/admin/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.token).toBeDefined();
      expect(typeof refreshResponse.body.token).toBe('string');
    });
  });
});

