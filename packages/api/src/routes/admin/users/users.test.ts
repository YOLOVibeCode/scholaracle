import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { adminUsersRouter } from './users';
import { adminAuthRouter } from '../auth/auth';
import { AdminUserRepository, AdminStepUpChallengeRepository } from '@scholaracle/database';
import { createTestAdmin, getStepUpToken } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

describe('Admin Users Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let superToken: string;
  let superMfaSecret: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test');

    await database.collection('admin_users').deleteMany({});

    const superResult = await createTestAdmin(database, 'test-secret', {
      email: 'super-admin-users@test.com',
      password: 'AdminPass123!',
      name: 'Super',
      role: 'admin',
    });
    superToken = superResult.token;
    superMfaSecret = superResult.mfaSecret;

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
    app.use('/api/admin/users', adminUsersRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  it('should list admin users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should create admin user', async () => {
    const stepUpToken = await getStepUpToken(app, superToken, superMfaSecret);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`)
      .set('x-admin-stepup', stepUpToken)
      .send({
        email: `new.${Date.now()}@test.com`,
        name: 'New Admin',
        role: 'admin',
        password: 'NewPass123!',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.id).toBeTruthy();
  });

  it('should reject create with missing fields', async () => {
    const stepUpToken = await getStepUpToken(app, superToken, superMfaSecret);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`)
      .set('x-admin-stepup', stepUpToken)
      .send({ email: `missing.${Date.now()}@test.com` });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should update admin role', async () => {
    const stepUpToken = await getStepUpToken(app, superToken, superMfaSecret);
    const repo = new AdminUserRepository(database);
    const pwHash = await AdminUserRepository.hashPassword('AdminPass123!');
    const u = await repo.create({
      email: `edit.${Date.now()}@test.com`,
      passwordHash: pwHash,
      name: 'Edit Me',
      role: 'admin',
    });

    const res = await request(app)
      .put(`/api/admin/users/${u._id!.toString()}`)
      .set('Authorization', `Bearer ${superToken}`)
      .set('x-admin-stepup', stepUpToken)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should require step-up when MFA is enabled (create + update)', async () => {
    const repo = new AdminUserRepository(database);
    // super admin already has MFA from createTestAdmin; superToken is post-MFA token
    const superTokenWithMFA = superToken;
    const secret = superMfaSecret;

    // Create without step-up should be denied
    const deniedCreate = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .send({
        email: `mfa-create.${Date.now()}@test.com`,
        name: 'MFA Create',
        role: 'admin',
        password: 'NewPass123!',
      });
    expect(deniedCreate.status).toBe(401);
    expect(String(deniedCreate.body.code ?? '')).toContain('MFA_STEP_UP');

    // Step-up mint
    const stepUpToken = await getStepUpToken(app, superTokenWithMFA, secret);

    // Create with step-up should succeed
    const okCreate = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .set('x-admin-stepup', stepUpToken)
      .send({
        email: `mfa-create.${Date.now()}@test.com`,
        name: 'MFA Create',
        role: 'admin',
        password: 'NewPass123!',
      });
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
      .send({ role: 'admin' });
    expect(deniedUpdate.status).toBe(401);
    expect(String(deniedUpdate.body.code ?? '')).toContain('MFA_STEP_UP');

    // Update with step-up should succeed
    const okUpdate = await request(app)
      .put(`/api/admin/users/${u._id!.toString()}`)
      .set('Authorization', `Bearer ${superTokenWithMFA}`)
      .set('x-admin-stepup', stepUpToken)
      .send({ role: 'admin' });
    expect(okUpdate.status).toBe(200);
    expect(okUpdate.body.success).toBe(true);
  });
});
