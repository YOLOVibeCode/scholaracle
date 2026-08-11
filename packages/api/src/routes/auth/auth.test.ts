import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { PasswordResetTokenRepository, RefreshTokenRepository } from '@scholaracle/database';
import { authRouter } from './auth';
import { createErrorHandler } from '../../middleware/errorHandler';

const noOpEmailSender = {
  sendResetLink: async (): Promise<void> => {},
};

describe('Auth API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    // Connect to test database
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      return;
    }

    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const refreshTokenStore = new RefreshTokenRepository(database);

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        passwordResetTokenStore,
        passwordResetEmailSender: noOpEmailSender,
        baseUrl: 'http://localhost:2800',
        refreshTokenStore,
        refreshTokenExpiresIn: '30d',
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    // Clean up test users, reset tokens, and refresh tokens before each test
    if (database) {
      await database.collection('users').deleteMany({
        email: {
          $in: [
            'authtest@example.com',
            'authdup@example.com',
            'nonexistent@example.com',
            'forcereset@example.com',
          ],
        },
      });
      await database.collection('password_reset_tokens').deleteMany({});
      await database.collection('refresh_tokens').deleteMany({});
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('authtest@example.com');
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject duplicate email registration', async () => {
      // Register first time
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authdup@example.com', password: 'password123', name: 'First User' });

      // Register second time with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authdup@example.com', password: 'password456', name: 'Second User' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Register a user first
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      // Login with that user
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should reject login with wrong password', async () => {
      // Register a user first
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      // Login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return forcePasswordReset true when user is flagged', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'forcereset@example.com',
        password: 'password123',
        name: 'Force Reset User',
      });

      const user = await database.collection('users').findOne({ email: 'forcereset@example.com' });
      expect(user).not.toBeNull();
      await database
        .collection('users')
        .updateOne(
          { _id: user!._id },
          { $set: { forcePasswordReset: true, updatedAt: new Date() } }
        );

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'forcereset@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.forcePasswordReset).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return 200 with success when email is provided', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'authtest@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app).post('/api/auth/forgot-password').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('email');
    });

    it('should return 429 when rate limit exceeded for same email', async () => {
      const email = 'ratelimit@example.com';
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/forgot-password').send({ email });
      }
      const response = await request(app).post('/api/auth/forgot-password').send({ email });

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/too many|try again/i);
    }, 10000);
  });

  describe('POST /api/auth/reset-password', () => {
    it('should return 400 when token or newPassword is missing', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-token' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 when token is invalid or expired', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123!' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid|expired/i);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new token pair with valid refresh token', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      expect(reg.status).toBe(201);
      expect(reg.body.refreshToken).toBeDefined();

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.refreshToken).not.toBe(reg.body.refreshToken);
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when refreshToken is missing', async () => {
      const response = await request(app).post('/api/auth/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('refreshToken');
    });
  });

  describe('POST /api/auth/oauth', () => {
    it('should return 401 when x-internal-api-secret is missing or invalid', async () => {
      const response = await request(app)
        .post('/api/auth/oauth')
        .send({ email: 'oauth@example.com', name: 'OAuth User' });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/unauthorized/i);
    });

    it('should return 400 when email or name is missing', async () => {
      const oldSecret = process.env['INTERNAL_API_SECRET'];
      process.env['INTERNAL_API_SECRET'] = 'test-internal-secret';

      const response = await request(app)
        .post('/api/auth/oauth')
        .set('x-internal-api-secret', 'test-internal-secret')
        .send({
          provider: 'google',
          providerAccountId: '12345',
          email: 'oauth@example.com',
        });

      if (oldSecret !== undefined) process.env['INTERNAL_API_SECRET'] = oldSecret;
      else delete process.env['INTERNAL_API_SECRET'];

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/missing|required/i);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 and revoke refresh token', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: reg.body.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Using the same refresh token again should fail (family revoked)
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      expect(refreshResponse.status).toBe(401);
    });

    it('should return 200 even when no refreshToken in body', async () => {
      const response = await request(app).post('/api/auth/logout').send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
