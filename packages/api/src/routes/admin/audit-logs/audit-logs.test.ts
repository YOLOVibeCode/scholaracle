import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { auditLogsRouter } from './audit-logs';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository, AuditLogRepository } from '@scholaracle/database';
import { adminAuthRouter } from '../auth/auth';

describe('Admin Audit Logs Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let superAdminToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const passwordHash = await AdminUserRepository.hashPassword('AdminPass123!');
    await new AdminUserRepository(database).create({
      email: 'audit-super@test.com',
      passwordHash,
      name: 'Audit Super',
      role: 'super_admin',
    });
    await new AdminUserRepository(database).create({
      email: 'audit-admin@test.com',
      passwordHash,
      name: 'Audit Admin',
      role: 'admin',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    superAdminToken = (await adminAuthService.login('audit-super@test.com', 'AdminPass123!')).token!;
    adminToken = (await adminAuthService.login('audit-admin@test.com', 'AdminPass123!')).token!;

    app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRouter({ database, jwtSecret: 'test-secret' }));
    app.use('/api/admin/audit-logs', auditLogsRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('audit_logs').deleteMany({});
  });

  it('should deny non-super_admin access', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('should list audit logs for super_admin', async () => {
    const repo = new AuditLogRepository(database);
    await repo.create({
      adminUserId: 'x',
      adminEmail: 'audit-super@test.com',
      action: 'customer:suspend',
      entityType: 'customer',
      entityId: 'cust1',
      reason: 'test',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const res = await request(app).get('/api/admin/audit-logs?page=1&limit=25').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should filter by action', async () => {
    const repo = new AuditLogRepository(database);
    await repo.create({
      adminUserId: 'x',
      adminEmail: 'audit-super@test.com',
      action: 'customer:suspend',
      entityType: 'customer',
      entityId: 'cust1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    await repo.create({
      adminUserId: 'x',
      adminEmail: 'audit-super@test.com',
      action: 'payment:refund',
      entityType: 'payment',
      entityId: 'pay1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const res = await request(app)
      .get('/api/admin/audit-logs?action=payment:refund')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].action).toBe('payment:refund');
  });

  it('should mask sensitive metadata fields', async () => {
    const repo = new AuditLogRepository(database);
    await repo.create({
      adminUserId: 'x',
      adminEmail: 'audit-super@test.com',
      action: 'admin:create',
      entityType: 'admin_user',
      entityId: 'admin1',
      reason: 'created',
      metadata: {
        token: 'secret-token',
        password: 'super-secret',
        mfaSecret: 'ABC123',
        nested: { authorization: 'Bearer xyz', ok: 'keep' },
      },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.length).toBeGreaterThan(0);

    const item = res.body.data.find((x: any) => x.action === 'admin:create');
    expect(item).toBeTruthy();
    expect(item.metadata.token).toBe('[REDACTED]');
    expect(item.metadata.password).toBe('[REDACTED]');
    expect(item.metadata.mfaSecret).toBe('[REDACTED]');
    expect(item.metadata.nested.authorization).toBe('[REDACTED]');
    expect(item.metadata.nested.ok).toBe('keep');
  });

  describe('GET /api/admin/audit-logs/export', () => {
    it('should export CSV and create a system:export audit log', async () => {
      const repo = new AuditLogRepository(database);
      await repo.create({
        adminUserId: 'x',
        adminEmail: 'audit-super@test.com',
        action: 'customer:suspend',
        entityType: 'customer',
        entityId: 'cust1',
        reason: 'test',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      const res = await request(app)
        .get('/api/admin/audit-logs/export?action=customer:suspend')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(String(res.headers['content-type'] ?? '')).toContain('text/csv');
      expect(String(res.text)).toContain('timestamp,adminEmail,action,entityType,entityId,severity,reason');
      expect(String(res.text)).toContain('customer:suspend');

      const docs = await database.collection('audit_logs').find({ action: 'system:export' }).toArray();
      expect(docs.length).toBeGreaterThan(0);
    });

    it('should require step-up when MFA is enabled', async () => {
      const speakeasy = require('speakeasy');
      const mfaService = new (require('@scholaracle/auth').MFAService)();

      const repo = new AdminUserRepository(database);
      const superAdmin = await repo.findByEmail('audit-super@test.com');
      expect(superAdmin).not.toBeNull();
      const { secret } = mfaService.generateSecret('audit-super@test.com');
      await repo.update(superAdmin!._id!.toString(), { mfaEnabled: true, mfaSecret: secret });

      // Login now requires MFA
      const loginRes = await request(app).post('/api/admin/auth/login').send({
        email: 'audit-super@test.com',
        password: 'AdminPass123!',
      });
      expect(loginRes.status).toBe(401);
      expect(loginRes.body.requiresMFA).toBe(true);
      const mfaToken = loginRes.body.mfaToken as string;

      const totp = speakeasy.totp({ secret, encoding: 'base32' });
      const verifyRes = await request(app).post('/api/admin/auth/mfa/verify').send({ mfaToken, token: totp });
      expect(verifyRes.status).toBe(200);
      const tokenWithMFA = verifyRes.body.token as string;

      // Export without step-up must be denied
      const denied = await request(app)
        .get('/api/admin/audit-logs/export')
        .set('Authorization', `Bearer ${tokenWithMFA}`);
      expect(denied.status).toBe(401);
      expect(String(denied.body.code ?? '')).toContain('MFA_STEP_UP');

      // Step-up mint
      const startRes = await request(app)
        .post('/api/admin/auth/step-up/start')
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .send({});
      expect(startRes.status).toBe(200);
      const stepUpId = startRes.body.data.stepUpId as string;

      const totp2 = speakeasy.totp({ secret, encoding: 'base32' });
      const stepUpRes = await request(app)
        .post('/api/admin/auth/step-up/verify')
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .send({ stepUpId, token: totp2 });
      expect(stepUpRes.status).toBe(200);
      const stepUpToken = stepUpRes.body.data.stepUpToken as string;
      expect(stepUpToken).toBeTruthy();

      const ok = await request(app)
        .get('/api/admin/audit-logs/export')
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .set('x-admin-stepup', stepUpToken);
      expect(ok.status).toBe(200);
      expect(String(ok.headers['content-type'] ?? '')).toContain('text/csv');
    });
  });
});


