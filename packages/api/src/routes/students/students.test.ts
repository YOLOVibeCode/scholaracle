import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from './students';
import { authMiddleware } from '../../middleware/auth';

describe('Students API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;

  beforeAll(async () => {
    // Connect to test database
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      return;
    }

    authService = new AuthService(database);

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/students', authMiddleware(authService), studentsRouter({ database }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    if (database) {
      // Clean up test data before each test
      await database.collection('students').deleteMany({});
      await database.collection('users').deleteMany({ email: 'students@example.com' });

      // Re-register test user for each test
      const registerResult = await authService.register(
        'students@example.com',
        'password123',
        'Students User'
      );
      if (registerResult.success && registerResult.user && registerResult.token) {
        testToken = registerResult.token;
      } else {
        throw new Error(`Failed to register test user: ${registerResult.error ?? 'Unknown error'}`);
      }
    }
  });

  describe('GET /api/students', () => {
    it('should return empty array when user has no students', async () => {
      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return all students for user', async () => {
      // Create 2 students
      await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student One', grade: 9 });

      await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student Two', grade: 10 });

      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[1]).toHaveProperty('name');
    });
  });

  describe('POST /api/students', () => {
    it('should create a student', async () => {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Test Student', grade: 10 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Student');
      expect(response.body.grade).toBe(10);
    });

    it('should reject creating student without name', async () => {
      const response = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('name');
    });
  });

  describe('GET /api/students/:id', () => {
    it('should get student by id', async () => {
      // Create a student first
      const createResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Test Student', grade: 11 });

      const studentId = createResponse.body.id;

      const response = await request(app)
        .get(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(studentId);
      expect(response.body.name).toBe('Test Student');
      expect(response.body.grade).toBe(11);
    });

    it('should return 404 for non-existent student', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .get(`/api/students/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/students/:id', () => {
    it('should update a student', async () => {
      // Create a student first
      const createResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Original Name', grade: 9 });

      const studentId = createResponse.body.id;

      const response = await request(app)
        .put(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should return 404 when updating non-existent student', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .put(`/api/students/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/students/:id', () => {
    it('should delete a student', async () => {
      // Create a student first
      const createResponse = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'To Delete', grade: 12 });

      const studentId = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify student is gone
      const getResponse = await request(app)
        .get(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent student', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .delete(`/api/students/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
