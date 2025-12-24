import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository } from '@scholaracle/database';
import { adminUsersRouter } from './users';
import { adminAuthRouter } from '../auth/auth';

describe('Admin Users Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let superToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test');

    await database.collection('admin_users').deleteMany({});

    const pwHash = await AdminUserRepository.hashPassword('AdminPass123!');
    await new AdminUserRepository(database).create({
      email: 'super-admin-users@test.com',
      passwordHash: pwHash,
      name: 'Super',
      role: 'super_admin',
    });
    await new AdminUserRepository(database).create({
      email: 'admin-admin-users@test.com',
      passwordHash: pwHash,
      name: 'Admin',
      role: 'admin',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    superToken = (await adminAuthService.login('super-admin-users@test.com', 'AdminPass123!')).token!;
    adminToken = (await adminAuthService.login('admin-admin-users@test.com', 'AdminPass123!')).token!;

    app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRouter({ database, jwtSecret: 'test-secret' }));
    app.use('/api/admin/users', adminUsersRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  it('should deny non-super_admin', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('should list users for super_admin', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should create admin user', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: `new.${Date.now()}@test.com`, name: 'New Admin', role: 'admin', password: 'NewPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.id).toBeTruthy();
  });

  it('should update admin role', async () => {
    const repo = new AdminUserRepository(database);
    const pwHash = await AdminUserRepository.hashPassword('AdminPass123!');
    const u = await repo.create({ email: `edit.${Date.now()}@test.com`, passwordHash: pwHash, name: 'Edit Me', role: 'admin' });

    const res = await request(app)
      .put(`/api/admin/users/${u._id!.toString()}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ role: 'support' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should require step-up when MFA is enabled (create + update)', async () => {
    const speakeasy = require('speakeasy');
    const mfaService = new (require('@scholaracle/auth').MFAService)();

    // Enable MFA on super admin
    const repo = new AdminUserRepository(database);
    const superAdmin = await repo.findByEmail('super-admin-users@test.com');
    expect(superAdmin).not.toBeNull();
    const { secret } = mfaService.generateSecret('super-admin-users@test.com');
    await repo.update(superAdmin!._id!.toString(), { mfaEnabled: true, mfaSecret: secret });

    // Login now requires MFA
    const loginRes = await request(app).post('/api/admin/auth/login').send({
      email: 'super-admin-users@test.com',
      password: 'AdminPass123!',
    });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.requiresMFA).toBe(true);
    const mfaToken = loginRes.body.mfaToken as string;

    const totp = speakeasy.totp({ secret, encoding: 'base32' });
    const verifyRes = await request(app).post('/api/admin/auth/mfa/verify').send({ mfaToken, token: totp });
    expect(verifyRes.status).toBe(200);
    const superTokenWithMFA = verifyRes.body.token as string;
    expect(superTokenWithMFA).toBeTruthy();

    // Create without step-up should be denied
    const deniedCreate = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .send({ email: `mfa-create.${Date.now()}@test.com`, name: 'MFA Create', role: 'admin', password: 'NewPass123!' });
    expect(deniedCreate.status).toBe(401);
    expect(String(deniedCreate.body.code ?? '')).toContain('MFA_STEP_UP');

    // Step-up mint
    const startRes = await request(app)
      .post('/api/admin/auth/step-up/start')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .send({});
    expect(startRes.status).toBe(200);
    const stepUpId = startRes.body.data.stepUpId as string;

    const totp2 = speakeasy.totp({ secret, encoding: 'base32' });
    const stepUpRes = await request(app)
      .post('/api/admin/auth/step-up/verify')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .send({ stepUpId, token: totp2 });
    expect(stepUpRes.status).toBe(200);
    const stepUpToken = stepUpRes.body.data.stepUpToken as string;
    expect(stepUpToken).toBeTruthy();

    // Create with step-up should succeed
    const okCreate = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .set('x-admin-stepup', stepUpToken)
      .send({ email: `mfa-create.${Date.now()}@test.com`, name: 'MFA Create', role: 'admin', password: 'NewPass123!' });
    expect(okCreate.status).toBe(200);
    expect(okCreate.body.success).toBe(true);

    // Update without step-up should be denied
    const u = await repo.create({
      email: `mfa-edit.${Date.now()}@test.com`,
      passwordHash: await AdminUserRepository.hashPassword('AdminPass123!'),
      name: 'MFA Edit',
      role: 'admin',
    });
    const deniedUpdate = await request(app)
      .put(`/api/admin/users/${u._id!.toString()}`)
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .send({ role: 'support' });
    expect(deniedUpdate.status).toBe(401);
    expect(String(deniedUpdate.body.code ?? '')).toContain('MFA_STEP_UP');

    // Update with step-up should succeed
    const okUpdate = await request(app)
      .put(`/api/admin/users/${u._id!.toString()}`)
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .set('x-admin-stepup', stepUpToken)
      .send({ role: 'support' });
    expect(okUpdate.status).toBe(200);
    expect(okUpdate.body.success).toBe(true);
  });
});


