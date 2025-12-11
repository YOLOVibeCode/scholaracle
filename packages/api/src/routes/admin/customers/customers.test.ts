import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { customersRouter } from './customers';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository, UserRepository } from '@scholaracle/database';

describe('Admin Customer Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    // Create admin users
    const adminRepo = new AdminUserRepository(database);
    const passwordHash = await AdminUserRepository.hashPassword('AdminPass123!');
    
    await adminRepo.create({
      email: 'admin@test.com',
      passwordHash,
      name: 'Regular Admin',
      role: 'admin',
    });

    await adminRepo.create({
      email: 'super@test.com',
      passwordHash,
      name: 'Super Admin',
      role: 'super_admin',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    
    const adminLogin = await adminAuthService.login('admin@test.com', 'AdminPass123!');
    adminToken = adminLogin.token!;
    
    const superLogin = await adminAuthService.login('super@test.com', 'AdminPass123!');
    superAdminToken = superLogin.token!;

    app = express();
    app.use(express.json());
    app.use('/api/admin/customers', customersRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
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
    it('should delete customer as super_admin', async () => {
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

    it('should reject deletion from non-super_admin', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const customer = await new UserRepository(database).create({
        email: 'delete2@test.com',
        passwordHash,
        name: 'Delete User 2',
      });

      const response = await request(app)
        .delete(`/api/admin/customers/${customer._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test deletion' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('super_admin');
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

      const auditLogs = await database.collection('audit_logs').find({
        action: 'customer:delete',
      }).toArray();
      
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

      const auditLogs = await database.collection('audit_logs').find({
        action: 'customer:suspend',
      }).toArray();
      
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

      const auditLogs = await database.collection('audit_logs').find({
        action: 'customer:unsuspend',
      }).toArray();
      
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });
});

