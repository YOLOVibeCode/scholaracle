import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { SessionRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { adminSessionsRouter } from './sessions';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';

describe('Admin Sessions Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let adminId: string;
  let sessionRepo: SessionRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    await database.collection('admin_users').deleteMany({});
    await database.collection('sessions').deleteMany({});

    const { token, admin } = await createTestAdmin(database, 'test-secret', {
      email: 'sessions-admin@test.com',
      password: 'AdminPass123!',
      name: 'Sessions Admin',
      role: 'admin',
    });
    adminToken = token;
    adminId = admin.id;

    sessionRepo = new SessionRepository(database);
    const adminAuthService = new AdminAuthService(database, 'test-secret');

    app = express();
    app.use(express.json());
    app.use(
      '/api/admin/sessions',
      adminSessionsRouter({
        database,
        adminAuthService,
        adminJwtSecret: 'test-secret',
      })
    );
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('sessions').deleteMany({ userId: adminId });
  });

  describe('GET /api/admin/sessions', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/admin/sessions');
      expect(res.status).toBe(401);
    });

    it('should return list of admin sessions', async () => {
      await sessionRepo.create({
        userId: adminId,
        userType: 'admin',
        refreshTokenFamilyId: 'fam-1',
        deviceInfo: { browser: 'Chrome' },
        ipAddress: '127.0.0.1',
        lastActiveAt: new Date(),
      });

      const res = await request(app)
        .get('/api/admin/sessions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /api/admin/sessions/:id', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).delete('/api/admin/sessions/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });

    it('should revoke admin session by id', async () => {
      const session = await sessionRepo.create({
        userId: adminId,
        userType: 'admin',
        refreshTokenFamilyId: 'fam-2',
        deviceInfo: {},
        ipAddress: '127.0.0.1',
        lastActiveAt: new Date(),
      });

      const res = await request(app)
        .delete(`/api/admin/sessions/${session._id.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const listRes = await request(app)
        .get('/api/admin/sessions')
        .set('Authorization', `Bearer ${adminToken}`);
      const ids = (listRes.body.sessions as { id: string }[]).map((s) => s.id);
      expect(ids).not.toContain(session._id.toString());
    });

    it('should return 404 when session not found', async () => {
      const res = await request(app)
        .delete('/api/admin/sessions/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
