import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { notesRouter } from './notes';
import { UserRepository } from '@scholaracle/database';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';

describe('Admin Notes Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let testCustomerId: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const { token } = await createTestAdmin(database, 'test-secret', {
      email: 'notes-admin@test.com',
      password: 'AdminPass123!',
      name: 'Notes Admin',
      role: 'admin',
    });
    adminToken = token;

    // Create test customer
    const customerPasswordHash = await UserRepository.hashPassword('TestPass123!');
    const customer = await new UserRepository(database).create({
      email: 'notecustomer@test.com',
      passwordHash: customerPasswordHash,
      name: 'Note Customer',
    });
    testCustomerId = customer._id!.toString();

    app = express();
    app.use(express.json());
    app.use('/api/admin', notesRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_notes').deleteMany({});
  });

  describe('GET /api/admin/customers/:customerId/notes', () => {
    it('should list customer notes', async () => {
      const response = await request(app)
        .get(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/admin/customers/${testCustomerId}/notes`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/admin/customers/:customerId/notes', () => {
    it('should create note', async () => {
      const response = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Test note content',
          category: 'general',
          isInternal: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('Test note content');
    });

    it('should require content and category', async () => {
      const response = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('PUT /api/admin/notes/:noteId', () => {
    it('should update note', async () => {
      // Create a note first
      const createResponse = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Original content',
          category: 'general',
        });

      const noteId = createResponse.body.data.id;

      const updateResponse = await request(app)
        .put(`/api/admin/notes/${noteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Updated content',
          category: 'billing',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.content).toBe('Updated content');
    });

    it('should return 404 for non-existent note', async () => {
      const response = await request(app)
        .put('/api/admin/notes/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Updated',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/notes/:noteId', () => {
    it('should delete note', async () => {
      const createResponse = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Delete me',
          category: 'general',
        });

      const noteId = createResponse.body.data.id;

      const deleteResponse = await request(app)
        .delete(`/api/admin/notes/${noteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
    });
  });

  describe('POST /api/admin/notes/:noteId/pin', () => {
    it('should pin note', async () => {
      const createResponse = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Pin me',
          category: 'general',
        });

      const noteId = createResponse.body.data.id;

      const pinResponse = await request(app)
        .post(`/api/admin/notes/${noteId}/pin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pinned: true });

      expect(pinResponse.status).toBe(200);
      expect(pinResponse.body.success).toBe(true);
    });

    it('should unpin note', async () => {
      const createResponse = await request(app)
        .post(`/api/admin/customers/${testCustomerId}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Unpin me',
          category: 'general',
        });

      const noteId = createResponse.body.data.id;

      // Pin first
      await request(app)
        .post(`/api/admin/notes/${noteId}/pin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pinned: true });

      // Then unpin
      const unpinResponse = await request(app)
        .post(`/api/admin/notes/${noteId}/pin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pinned: false });

      expect(unpinResponse.status).toBe(200);
      expect(unpinResponse.body.success).toBe(true);
    });
  });
});
