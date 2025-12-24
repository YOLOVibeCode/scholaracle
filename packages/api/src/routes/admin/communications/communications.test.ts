import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { communicationsRouter } from './communications';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository, UserRepository } from '@scholaracle/database';

describe('Admin Communications Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let superAdminToken: string;
  let billingToken: string;
  let supportToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    await database.collection('admin_users').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('communication_logs').deleteMany({});
    await database.collection('communication_templates').deleteMany({});

    const pwHash = await AdminUserRepository.hashPassword('AdminPass123!');
    await new AdminUserRepository(database).create({
      email: 'comms-super@test.com',
      passwordHash: pwHash,
      name: 'Comms Super',
      role: 'super_admin',
    });
    await new AdminUserRepository(database).create({
      email: 'comms-support@test.com',
      passwordHash: pwHash,
      name: 'Comms Support',
      role: 'support',
    });
    await new AdminUserRepository(database).create({
      email: 'comms-billing@test.com',
      passwordHash: pwHash,
      name: 'Comms Billing',
      role: 'billing',
    });

    const user = await new UserRepository(database).create({
      email: 'test.parent@example.com',
      passwordHash: await UserRepository.hashPassword('TestPass123!'),
      name: 'Test Parent',
      role: 'parent',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    testUserId = user._id!.toString();

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    superAdminToken = (await adminAuthService.login('comms-super@test.com', 'AdminPass123!')).token!;
    supportToken = (await adminAuthService.login('comms-support@test.com', 'AdminPass123!')).token!;
    billingToken = (await adminAuthService.login('comms-billing@test.com', 'AdminPass123!')).token!;

    app = express();
    app.use(express.json());
    app.use('/api/admin/communications', communicationsRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_logs').deleteMany({});
    await database.collection('communication_templates').deleteMany({});
  });

  it('should deny billing role from communications', async () => {
    const res = await request(app).get('/api/admin/communications/logs').set('Authorization', `Bearer ${billingToken}`);
    expect(res.status).toBe(403);
  });

  it('should allow support to send an email and log it', async () => {
    const sendRes = await request(app)
      .post('/api/admin/communications/send')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({
        recipientEmail: 'test.parent@example.com',
        subject: 'Test Communication',
        content: 'Hello from API test',
      });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data?.id).toBeTruthy();

    const listRes = await request(app)
      .get(`/api/admin/communications/logs?userId=${testUserId}`)
      .set('Authorization', `Bearer ${supportToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].subject).toBe('Test Communication');
  });

  it('should allow super_admin to list logs', async () => {
    const res = await request(app).get('/api/admin/communications/logs').set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  describe('Templates', () => {
    it('should allow support to create and list templates', async () => {
      const createRes = await request(app)
        .post('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          name: 'Template 1',
          channel: 'email',
          type: 'support',
          subject: 'Hello',
          content: 'Body',
        });
      expect(createRes.status).toBe(200);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data?.id).toBeTruthy();

      const listRes = await request(app)
        .get('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].name).toBe('Template 1');
    });

    it('should deny billing from templates', async () => {
      const res = await request(app)
        .get('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${billingToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow updating template', async () => {
      const createRes = await request(app)
        .post('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          name: 'Template 1',
          channel: 'email',
          type: 'support',
          subject: 'Hello',
          content: 'Body',
        });
      const id = createRes.body.data.id as string;
      expect(id).toBeTruthy();

      const updateRes = await request(app)
        .put(`/api/admin/communications/templates/${id}`)
        .set('Authorization', `Bearer ${supportToken}`)
        .send({ subject: 'Updated', content: 'New body' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);

      const listRes = await request(app)
        .get('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(listRes.body.data[0].subject).toBe('Updated');
    });

    it('should allow sending using template and log templateName', async () => {
      const createRes = await request(app)
        .post('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          name: 'Templated',
          channel: 'email',
          type: 'support',
          subject: 'Templated Subject',
          content: 'Templated Content',
        });
      const templateId = createRes.body.data.id as string;

      const sendRes = await request(app)
        .post('/api/admin/communications/send')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          recipientEmail: 'test.parent@example.com',
          templateId,
        });
      expect(sendRes.status).toBe(200);

      const listRes = await request(app)
        .get(`/api/admin/communications/logs?userId=${testUserId}`)
        .set('Authorization', `Bearer ${supportToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data[0].templateId).toBe(templateId);
      expect(listRes.body.data[0].templateName).toBe('Templated');
      expect(listRes.body.data[0].subject).toBe('Templated Subject');
    });
  });

  describe('Bulk Sends', () => {
    it('should allow super_admin to create a bulk send batch for role segment', async () => {
      const createTemplate = await request(app)
        .post('/api/admin/communications/templates')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Bulk Template',
          channel: 'email',
          type: 'support',
          subject: 'Bulk Subject',
          content: 'Bulk Body',
        });
      expect(createTemplate.status).toBe(200);
      const templateId = createTemplate.body.data.id as string;

      const res = await request(app)
        .post('/api/admin/communications/bulk-send')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          criteria: { role: 'parent' },
          templateId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.batchId).toBeTruthy();

      const batches = await request(app).get('/api/admin/communications/batches').set('Authorization', `Bearer ${superAdminToken}`);
      expect(batches.status).toBe(200);
      expect(Array.isArray(batches.body.data)).toBe(true);
      expect(batches.body.data.length).toBeGreaterThan(0);
    });

    it('should deny billing from bulk sends', async () => {
      const res = await request(app)
        .post('/api/admin/communications/bulk-send')
        .set('Authorization', `Bearer ${billingToken}`)
        .send({ criteria: { role: 'parent' }, subject: 'S', content: 'C' });
      expect(res.status).toBe(403);
    });
  });

  describe('Delivery tracking + analytics', () => {
    it('should filter logs by status', async () => {
      // Create one sent message
      await request(app)
        .post('/api/admin/communications/send')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          recipientEmail: 'test.parent@example.com',
          subject: 'Status Filter',
          content: 'Hello',
        });

      const sentRes = await request(app)
        .get('/api/admin/communications/logs?status=sent')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(sentRes.status).toBe(200);
      expect(sentRes.body.data.length).toBeGreaterThan(0);

      const openedRes = await request(app)
        .get('/api/admin/communications/logs?status=opened')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(openedRes.status).toBe(200);
      expect(openedRes.body.data.length).toBe(0);
    });

    it('should return analytics summary', async () => {
      await request(app)
        .post('/api/admin/communications/send')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          recipientEmail: 'test.parent@example.com',
          subject: 'Analytics',
          content: 'Hello',
        });

      const res = await request(app)
        .get('/api/admin/communications/analytics?days=7')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.total).toBeGreaterThan(0);
      expect(res.body.data?.deliveryRate).toBeGreaterThanOrEqual(0);
    });
  });
});


