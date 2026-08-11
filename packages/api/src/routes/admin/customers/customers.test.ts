import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { customersRouter } from './customers';
import { AuthService } from '@scholaracle/auth';
import { adminAuthRouter } from '../auth/auth';
import {
  AdminStepUpChallengeRepository,
  UserRepository,
  StudentRepository,
  PaymentRepository,
  PasswordResetTokenRepository,
} from '@scholaracle/database';
import { createTestAdmin, getStepUpToken } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

const noOpPasswordResetSender = { sendResetLink: async (): Promise<void> => {} };
const mockPasswordChangedSender = {
  sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
};

describe('Admin Customer Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let adminMfaSecret: string;
  let superAdminToken: string;
  let superAdminMfaSecret: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const adminResult = await createTestAdmin(database, 'test-secret', {
      email: 'admin@test.com',
      password: 'AdminPass123!',
      name: 'Regular Admin',
      role: 'admin',
    });
    adminToken = adminResult.token;
    adminMfaSecret = adminResult.mfaSecret;

    const superResult = await createTestAdmin(database, 'test-secret', {
      email: 'super@test.com',
      password: 'AdminPass123!',
      name: 'Super Admin',
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
    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const authServiceForReset = new AuthService(
      database,
      'test-secret',
      '15m',
      passwordResetTokenStore,
      noOpPasswordResetSender,
      'http://localhost:2800'
    );
    app.use(
      '/api/admin/customers',
      customersRouter({
        database,
        jwtSecret: 'test-secret',
        authService: authServiceForReset,
        passwordChangedEmailSender: mockPasswordChangedSender,
        baseUrl: 'https://test.example.com',
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('students').deleteMany({});
    await database.collection('admin_notes').deleteMany({});
    await database.collection('payments').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('audit_logs').deleteMany({});
    await database.collection('password_reset_tokens').deleteMany({});
  });

  describe('GET /api/admin/customers/:id/students', () => {
    it('should return students for customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const userRepo = new UserRepository(database);
      const customer = await userRepo.create({
        email: 'studentparent@test.com',
        passwordHash,
        name: 'Student Parent',
      });

      const studentRepo = new StudentRepository(database);
      await studentRepo.create({
        userId: customer._id!.toString(),
        name: 'Student One',
        grade: 5,
        studentId: 'S-001',
        stats: { currentGPA: 3.5, missingAssignments: 1, totalAssignments: 10 },
      });

      const res = await request(app)
        .get(`/api/admin/customers/${customer._id!.toString()}/students`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Student One');
      expect(res.body.data[0].userId).toBe(customer._id!.toString());
    });

    it('should return empty array when customer has no students', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'nostudents@test.com',
        passwordHash,
        name: 'No Students',
      });

      const res = await request(app)
        .get(`/api/admin/customers/${customer._id!.toString()}/students`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('GET /api/admin/customers/:id/activity', () => {
    it('should return recent activity items for customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const userRepo = new UserRepository(database);
      const customer = await userRepo.create({
        email: 'activity@test.com',
        passwordHash,
        name: 'Activity User',
      });

      // Create a student
      const studentRepo = new StudentRepository(database);
      await studentRepo.create({
        userId: customer._id!.toString(),
        name: 'Student Activity',
        grade: 6,
        studentId: 'S-ACT',
      });

      // Insert a payment
      await database.collection('payments').insertOne({
        userId: customer._id!.toString(),
        amount: 1999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        createdAt: new Date(),
      });

      // Insert an admin note
      await database.collection('admin_notes').insertOne({
        userId: customer._id!.toString(),
        adminUserId: 'admin-id',
        content: 'Test note',
        category: 'general',
        isInternal: true,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/admin/customers/${customer._id!.toString()}/activity`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should include at least one of each type
      const types = res.body.data.map((x: { type: string }) => x.type);
      expect(types).toContain('student');
      expect(types).toContain('payment');
      expect(types).toContain('note');
    });
  });

  describe('GET /api/admin/customers/:id/ltv', () => {
    it('should return customer lifetime value (net) in dollars', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'ltv@test.com',
        passwordHash,
        name: 'LTV User',
      });

      const paymentRepo = new PaymentRepository(database);
      await paymentRepo.create({
        userId: customer._id!.toString(),
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const res = await request(app)
        .get(`/api/admin/customers/${customer._id!.toString()}/ltv`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.ltv).toBe(19);
      expect(res.body.data?.currency).toBe('usd');
    });
  });

  describe('POST /api/admin/customers/:id/impersonate (step-up MFA)', () => {
    it('should require step-up when MFA is enabled', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'impersonate@test.com',
        passwordHash,
        name: 'Impersonate Target',
      });

      // Super admin already has MFA from createTestAdmin
      const tokenWithMFA = superAdminToken;

      // Without step-up header: denied
      const denied = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/impersonate`)
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .send({ reason: 'Support check' });
      expect(denied.status).toBe(401);
      expect(String(denied.body.code ?? '')).toContain('MFA_STEP_UP');

      const stepUpToken = await getStepUpToken(app, tokenWithMFA, superAdminMfaSecret);
      const ok = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/impersonate`)
        .set('Authorization', `Bearer ${tokenWithMFA}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ reason: 'Support check' });
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
      expect(ok.body.data?.token).toBeTruthy();
    });
  });

  describe('POST /api/admin/customers/:id/impersonate', () => {
    it('should return a user token for an admin', async () => {
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'impersonate@test.com',
        passwordHash,
        name: 'Impersonate User',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/impersonate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ reason: 'Support troubleshooting' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.token).toBeDefined();

      const userAuth = new AuthService(database, 'test-secret');
      const decoded = await userAuth.verifyToken(res.body.data.token);
      expect(decoded?.userId).toBe(customer._id!.toString());
      expect(decoded?.email).toBe('impersonate@test.com');

      const auditLogs = await database
        .collection('audit_logs')
        .find({ action: 'customer:impersonate' })
        .toArray();
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/customers', () => {
    it('should list customers', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await new UserRepository(database).create({
        email: 'customer1@test.com',
        passwordHash,
        name: 'Customer 1',
      });

      const response = await request(app)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const userRepo = new UserRepository(database);

      // Create 15 customers
      for (let i = 0; i < 15; i++) {
        await userRepo.create({
          email: `customer${i}@test.com`,
          passwordHash,
          name: `Customer ${i}`,
        });
      }

      const response = await request(app)
        .get('/api/admin/customers?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(10);
      expect(response.body.total).toBe(15);
      expect(response.body.totalPages).toBe(2);
    });

    it('should support search', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await new UserRepository(database).create({
        email: 'john.doe@test.com',
        passwordHash,
        name: 'John Doe',
      });
      await new UserRepository(database).create({
        email: 'jane.smith@test.com',
        passwordHash,
        name: 'Jane Smith',
      });

      const response = await request(app)
        .get('/api/admin/customers?search=john')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].email).toBe('john.doe@test.com');
    });

    it('should filter by plan', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await new UserRepository(database).create({
        email: 'premium@test.com',
        passwordHash,
        name: 'Premium User',
        subscription: { plan: 'premium', status: 'active' },
      });
      await new UserRepository(database).create({
        email: 'free@test.com',
        passwordHash,
        name: 'Free User',
        subscription: { plan: 'free', status: 'active' },
      });

      const response = await request(app)
        .get('/api/admin/customers?plan=premium')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].email).toBe('premium@test.com');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/customers');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/customers/:id', () => {
    it('should get customer details', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'detail@test.com',
        passwordHash,
        name: 'Detail User',
      });

      const response = await request(app)
        .get(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('detail@test.com');
    });

    it('should return 404 for non-existent customer', async () => {
      const response = await request(app)
        .get('/api/admin/customers/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PUT /api/admin/customers/:id', () => {
    it('should update customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'update@test.com',
        passwordHash,
        name: 'Update User',
      });

      const response = await request(app)
        .put(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should create audit log for updates', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'audit@test.com',
        passwordHash,
        name: 'Audit User',
      });

      await request(app)
        .put(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Name',
        });

      const auditLogs = await database.collection('audit_logs').find({}).toArray();
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/admin/customers/:id', () => {
    it('should delete customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'delete@test.com',
        passwordHash,
        name: 'Delete User',
      });

      const response = await request(app)
        .delete(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Test deletion' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should create audit log for deletion', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'deletelog@test.com',
        passwordHash,
        name: 'Delete Log User',
      });

      await request(app)
        .delete(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Test deletion' });

      const auditLogs = await database
        .collection('audit_logs')
        .find({
          action: 'customer:delete',
        })
        .toArray();

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/customers/:id/suspend', () => {
    it('should suspend customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'suspend@test.com',
        passwordHash,
        name: 'Suspend User',
      });

      const response = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Violation of terms' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require suspension reason', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'noreason@test.com',
        passwordHash,
        name: 'No Reason User',
      });

      const response = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should create audit log for suspension', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'suspendlog@test.com',
        passwordHash,
        name: 'Suspend Log User',
      });

      await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test suspension' });

      const auditLogs = await database
        .collection('audit_logs')
        .find({
          action: 'customer:suspend',
        })
        .toArray();

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/customers/:id/unsuspend', () => {
    it('should unsuspend customer', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const userRepo = new UserRepository(database);
      const customer = await userRepo.create({
        email: 'unsuspend@test.com',
        passwordHash,
        name: 'Unsuspend User',
      });

      // Suspend first
      await userRepo.suspendUser(customer._id!.toString(), 'Test');

      const response = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/unsuspend`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should create audit log for unsuspension', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const userRepo = new UserRepository(database);
      const customer = await userRepo.create({
        email: 'unsuspendlog@test.com',
        passwordHash,
        name: 'Unsuspend Log User',
      });

      await userRepo.suspendUser(customer._id!.toString(), 'Test');

      await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/unsuspend`)
        .set('Authorization', `Bearer ${adminToken}`);

      const auditLogs = await database
        .collection('audit_logs')
        .find({
          action: 'customer:unsuspend',
        })
        .toArray();

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/customers/:id/set-password', () => {
    it('should require step-up when MFA is enabled', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'setpw@test.com',
        passwordHash,
        name: 'Set Password User',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/set-password`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ password: 'NewPass123!' });
      expect(res.status).toBe(401);
      expect(String(res.body.code ?? '')).toContain('MFA_STEP_UP');
    });

    it('should set customer password and create audit log', async () => {
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('OldPass123!');
      const customer = await new UserRepository(database).create({
        email: 'setpw2@test.com',
        passwordHash,
        name: 'Set Password User 2',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/set-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ password: 'NewPass123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const auditLogs = await database
        .collection('audit_logs')
        .find({ action: 'customer:set_password', entityId: customer._id!.toString() })
        .toArray();
      expect(auditLogs.length).toBeGreaterThan(0);

      const updated = await new UserRepository(database).findById(customer._id!.toString());
      expect(updated).not.toBeNull();
      const isValid = await UserRepository.verifyPassword('NewPass123!', updated!.passwordHash);
      expect(isValid).toBe(true);
    });

    it('should reject password shorter than 8 characters', async () => {
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'shortpw@test.com',
        passwordHash,
        name: 'Short PW User',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/set-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/password|8/);
    });

    it('should call passwordChangedEmailSender after successful set-password', async () => {
      mockPasswordChangedSender.sendPasswordChanged.mockClear();
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('OldPass123!');
      const customer = await new UserRepository(database).create({
        email: 'pwchanged@test.com',
        passwordHash,
        name: 'Password Changed Notify',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/set-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ password: 'NewPass456!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPasswordChangedSender.sendPasswordChanged).toHaveBeenCalledTimes(1);
      expect(mockPasswordChangedSender.sendPasswordChanged).toHaveBeenCalledWith({
        to: 'pwchanged@test.com',
        baseUrl: 'https://test.example.com',
      });
    });
  });

  describe('POST /api/admin/customers/:id/send-reset', () => {
    it('should require step-up when MFA is enabled', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'sendreset@test.com',
        passwordHash,
        name: 'Send Reset User',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/send-reset`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(401);
      expect(String(res.body.code ?? '')).toContain('MFA_STEP_UP');
    });

    it('should send reset email and create audit log', async () => {
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'sendreset2@test.com',
        passwordHash,
        name: 'Send Reset User 2',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/send-reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const auditLogs = await database
        .collection('audit_logs')
        .find({ action: 'customer:send_reset', entityId: customer._id!.toString() })
        .toArray();
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/customers/:id/force-reset', () => {
    it('should require step-up when MFA is enabled', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'forcereset@test.com',
        passwordHash,
        name: 'Force Reset User',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/force-reset`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(401);
      expect(String(res.body.code ?? '')).toContain('MFA_STEP_UP');
    });

    it('should set forcePasswordReset on customer and create audit log', async () => {
      const stepUpToken = await getStepUpToken(app, adminToken, adminMfaSecret);
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'forcereset2@test.com',
        passwordHash,
        name: 'Force Reset User 2',
      });

      const res = await request(app)
        .post(`/api/admin/customers/${customer._id!.toString()}/force-reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-admin-stepup', stepUpToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const auditLogs = await database
        .collection('audit_logs')
        .find({ action: 'customer:force_reset', entityId: customer._id!.toString() })
        .toArray();
      expect(auditLogs.length).toBeGreaterThan(0);

      const updated = await new UserRepository(database).findById(customer._id!.toString());
      expect(updated).not.toBeNull();
      expect(updated!.forcePasswordReset).toBe(true);
    });
  });
});
