import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from '../students/students';
import { integrationsRouter } from './integrations';
import { authMiddleware } from '../../middleware/auth';

describe('Integrations API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;

  beforeAll(async () => {
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

    app = express();
    app.use(express.json());
    app.use('/api/students', authMiddleware(authService), studentsRouter({ database }));
    app.use('/api/integrations', authMiddleware(authService), integrationsRouter({ database }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    if (database) {
      await database.collection('students').deleteMany({});
      await database.collection('slc_sources').deleteMany({});
      await database.collection('users').deleteMany({ email: 'integrations@example.com' });

      const registerResult = await authService.register(
        'integrations@example.com',
        'password123',
        'Integrations User'
      );
      if (registerResult.success && registerResult.user && registerResult.token) {
        testToken = registerResult.token;
      } else {
        throw new Error(`Failed to register test user: ${registerResult.error ?? 'Unknown error'}`);
      }
    }
  });

  describe('GET /api/integrations', () => {
    it('should return empty array when user has no integrations', async () => {
      const response = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return list of integrations with linkedStudents', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas LMS',
        });
      expect(createRes.status).toBe(201);
      const id = createRes.body.id;

      const response = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(id);
      expect(response.body[0].provider).toBe('canvas');
      expect(response.body[0].displayName).toBe('Canvas LMS');
      expect(response.body[0].linkedStudents).toBe(0);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/integrations');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/integrations', () => {
    it('should create integration with required fields', async () => {
      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'skyward',
          adapterId: 'com.hobbyist.skyward-x',
          displayName: 'District Portal',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        provider: 'skyward',
        adapterId: 'com.hobbyist.skyward-x',
        displayName: 'District Portal',
        enabled: true,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should create integration with optional schedule, dataTypes, enabled', async () => {
      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
          schedule: 'hourly',
          dataTypes: ['grades'],
          enabled: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.schedule).toBe('hourly');
      expect(response.body.dataTypes).toEqual(['grades']);
      expect(response.body.enabled).toBe(false);
    });

    it('should return 400 when body is invalid', async () => {
      const response = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ provider: '', adapterId: '', displayName: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).post('/api/integrations').send({
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas',
      });
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/integrations/:id', () => {
    it('should return integration by id', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'My Canvas',
        });
      const id = createRes.body.id;

      const response = await request(app)
        .get(`/api/integrations/${id}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
      expect(response.body.displayName).toBe('My Canvas');
    });

    it('should return 404 for non-existent integration', async () => {
      const response = await request(app)
        .get('/api/integrations/non-existent-id')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/integrations/some-id');
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/integrations/:id', () => {
    it('should update integration', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Original',
        });
      const id = createRes.body.id;

      const response = await request(app)
        .put(`/api/integrations/${id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ displayName: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.displayName).toBe('Updated Name');

      const getRes = await request(app)
        .get(`/api/integrations/${id}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(getRes.body.displayName).toBe('Updated Name');
    });

    it('should return 404 when updating non-existent integration', async () => {
      const response = await request(app)
        .put('/api/integrations/non-existent-id')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ displayName: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/integrations/:id', () => {
    it('should delete integration', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'To Delete',
        });
      const id = createRes.body.id;

      const response = await request(app)
        .delete(`/api/integrations/${id}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const getRes = await request(app)
        .get(`/api/integrations/${id}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent integration', async () => {
      const response = await request(app)
        .delete('/api/integrations/non-existent-id')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/integrations/:id/students', () => {
    it('should return empty array when no students linked', async () => {
      const createRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const id = createRes.body.id;

      const response = await request(app)
        .get(`/api/integrations/${id}/students`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return linked students after assign', async () => {
      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;

      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Test Student', grade: 10 });
      const studentId = createStudentRes.body.id;

      await request(app)
        .post(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      const response = await request(app)
        .get(`/api/integrations/${integrationId}/students`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].studentId).toBe(studentId);
      expect(response.body[0].studentName).toBe('Test Student');
    });

    it('should return 404 for non-existent integration', async () => {
      const response = await request(app)
        .get('/api/integrations/non-existent-id/students')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/integrations/:id/students/:studentId', () => {
    it('should assign student to integration without credentials', async () => {
      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;

      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Linked Student', grade: 9 });
      const studentId = createStudentRes.body.id;

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.studentId).toBe(studentId);
      expect(response.body.integrationId).toBe(integrationId);
      expect(response.body.hasCredentials).toBe(false);
    });

    it('should assign student with credentials when provided', async () => {
      const encKey = process.env['CREDENTIALS_ENCRYPTION_KEY'];
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = 'test-32-byte-key-for-aes-256!!!!!!';

      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;

      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student With Creds', grade: 11 });
      const studentId = createStudentRes.body.id;

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          credentials: {
            authType: 'api',
            accessToken: 'secret-token',
          },
        });

      if (encKey !== undefined) process.env['CREDENTIALS_ENCRYPTION_KEY'] = encKey;
      else delete process.env['CREDENTIALS_ENCRYPTION_KEY'];

      expect(response.status).toBe(201);
      expect(response.body.studentId).toBe(studentId);
      expect(response.body.hasCredentials).toBe(true);
    });

    it('should return 404 when integration does not exist', async () => {
      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createStudentRes.body.id;

      const response = await request(app)
        .post(`/api/integrations/non-existent-id/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 when student does not exist', async () => {
      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;
      const nonExistentStudentId = '000000000000000000000000';

      const response = await request(app)
        .post(`/api/integrations/${integrationId}/students/${nonExistentStudentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/integrations/:id/students/:studentId', () => {
    it('should unlink student from integration', async () => {
      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;

      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'To Unlink', grade: 10 });
      const studentId = createStudentRes.body.id;

      await request(app)
        .post(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      const response = await request(app)
        .delete(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const listRes = await request(app)
        .get(`/api/integrations/${integrationId}/students`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(listRes.body.length).toBe(0);
    });

    it('should return 404 when integration does not exist', async () => {
      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createStudentRes.body.id;

      const response = await request(app)
        .delete(`/api/integrations/non-existent-id/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 when student is not linked', async () => {
      const createIntRes = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });
      const integrationId = createIntRes.body.id;

      const createStudentRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Not Linked', grade: 9 });
      const studentId = createStudentRes.body.id;

      const response = await request(app)
        .delete(`/api/integrations/${integrationId}/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
