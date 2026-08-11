import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { auditLogsRouter } from './audit-logs';
import { AdminStepUpChallengeRepository, AuditLogRepository } from '@scholaracle/database';
import { adminAuthRouter } from '../auth/auth';
import { createTestAdmin, getStepUpToken } from '../../../test-utils/admin-test-helper';
import { createErrorHandler, notFoundHandler } from '../../../middleware/errorHandler';

describe('Admin Audit Logs Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let superAdminToken: string;
  let superAdminMfaSecret: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const superResult = await createTestAdmin(database, 'test-secret', {
      email: 'audit-super@test.com',
      password: 'AdminPass123!',
      name: 'Audit Super',
      role: 'admin',
    });
    superAdminToken = superResult.token;
    superAdminMfaSecret = superResult.mfaSecret;

    app = express();
    app.use(express.json());
    app.use(
      '/api/admin/auth',
      adminAuthRouter({
        database,
        jwtSecret: 'test-secret',
        stepUpChallengeStore: new AdminStepUpChallengeRepository(database),
      })
    );
    app.use('/api/admin/audit-logs', auditLogsRouter({ database, jwtSecret: 'test-secret' }));
    app.use(notFoundHandler);
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('audit_logs').deleteMany({});
  });

  it('should list audit logs', async () => {
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
      .get('/api/admin/audit-logs?page=1&limit=25')
      .set('Authorization', `Bearer ${superAdminToken}`);
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

    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);
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
      const stepUpToken = await getStepUpToken(app, superAdminToken, superAdminMfaSecret);
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
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-admin-stepup', stepUpToken);

      expect(res.status).toBe(200);
      expect(String(res.headers['content-type'] ?? '')).toContain('text/csv');
      expect(String(res.text)).toContain(
        'timestamp,adminEmail,action,entityType,entityId,severity,reason'
      );
      expect(String(res.text)).toContain('customer:suspend');

      const docs = await database
        .collection('audit_logs')
        .find({ action: 'system:export' })
        .toArray();
      expect(docs.length).toBeGreaterThan(0);
    });

    it('should require step-up when MFA is enabled', async () => {
      // Super admin already has MFA from createTestAdmin
      const tokenWithMFA = superAdminToken;

      // Export without step-up must be denied
      const denied = await request(app)
        .get('/api/admin/audit-logs/export')
        .set('Authorization', `Bearer ${tokenWithMFA}`);
      expect(denied.status).toBe(401);
      expect(String(denied.body.code ?? '')).toContain('MFA_STEP_UP');

      const stepUpToken = await getStepUpToken(app, tokenWithMFA, superAdminMfaSecret);
      const ok = await request(app)
        .get('/api/admin/audit-logs/export')
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .set('x-admin-stepup', stepUpToken);
      expect(ok.status).toBe(200);
      expect(String(ok.headers['content-type'] ?? '')).toContain('text/csv');
    });
  });

  describe('error envelope', () => {
    it('should return NOT_FOUND code for unknown route', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs/does-not-exist')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
