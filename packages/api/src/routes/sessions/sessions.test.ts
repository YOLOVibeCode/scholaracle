import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import {
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  SessionRepository,
} from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { authRouter } from '../auth/auth';
import { sessionsRouter } from './sessions';

const noOpEmailSender = {
  sendResetLink: async (): Promise<void> => {},
};

describe('Sessions API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let sessionRepo: SessionRepository;
  let authService: AuthService;
  let testToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping sessions tests');
      return;
    }

    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const refreshTokenStore = new RefreshTokenRepository(database);
    sessionRepo = new SessionRepository(database);
    authService = new AuthService(
      database,
      'test-secret',
      '15m',
      passwordResetTokenStore,
      noOpEmailSender,
      'http://localhost:2800',
      refreshTokenStore,
      '30d',
      '24h',
      undefined
    );

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
        sessionRepository: sessionRepo,
        authService,
      })
    );
    app.use('/api/sessions', sessionsRouter({ database, authService }));
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  beforeEach(async () => {
    if (!database) return;
    await database.collection('users').deleteMany({ email: 'sessions@example.com' });
    await database.collection('refresh_tokens').deleteMany({});
    await database.collection('sessions').deleteMany({});

    const registerRes = await request(app).post('/api/auth/register').send({
      email: 'sessions@example.com',
      password: 'password123',
      name: 'Sessions User',
    });
    if (registerRes.status !== 201 || !registerRes.body.token) {
      throw new Error(`Register failed: ${JSON.stringify(registerRes.body)}`);
    }
    testToken = registerRes.body.token;
    testUserId = registerRes.body.user?.id;
    if (!testUserId) throw new Error('No user id in register response');
  });

  describe('GET /api/sessions', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/sessions');
      expect(response.status).toBe(401);
    });

    it('should return current user sessions with isCurrent for this device', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBeGreaterThanOrEqual(1);
      const current = response.body.sessions.find((s: { isCurrent: boolean }) => s.isCurrent);
      expect(current).toBeDefined();
      expect(current).toHaveProperty('id');
      expect(current).toHaveProperty('lastActiveAt');
      expect(current).toHaveProperty('createdAt');
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).delete('/api/sessions/507f1f77bcf86cd799439011');
      expect(response.status).toBe(401);
    });

    it('should revoke a session by id', async () => {
      const listRes = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      const sessions = listRes.body.sessions as { id: string }[];
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const toRevoke = sessions[0]!.id;

      const revokeRes = await request(app)
        .delete(`/api/sessions/${toRevoke}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      const listAfter = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      const ids = (listAfter.body.sessions as { id: string }[]).map((s) => s.id);
      expect(ids).not.toContain(toRevoke);
    });

    it('should return 404 when revoking non-existent session', async () => {
      const response = await request(app)
        .delete('/api/sessions/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/sessions (revoke all other)', () => {
    it('should return 401 without token', async () => {
      const response = await request(app).delete('/api/sessions');
      expect(response.status).toBe(401);
    });

    it('should revoke all other sessions and keep current', async () => {
      const listRes = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      const sessions = listRes.body.sessions as { id: string; isCurrent: boolean }[];
      const currentSession = sessions.find((s) => s.isCurrent);
      if (!currentSession) throw new Error('No current session');

      await sessionRepo.create({
        userId: testUserId,
        userType: 'user',
        refreshTokenFamilyId: 'other-family-id',
        deviceInfo: {},
        ipAddress: '127.0.0.1',
        lastActiveAt: new Date(),
      });

      const listBefore = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      expect((listBefore.body.sessions as unknown[]).length).toBe(2);

      const revokeRes = await request(app)
        .delete('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.revoked).toBe(1);

      const listAfter = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);
      expect((listAfter.body.sessions as unknown[]).length).toBe(1);
      expect((listAfter.body.sessions as { id: string }[])[0]!.id).toBe(currentSession.id);
    });
  });
});
