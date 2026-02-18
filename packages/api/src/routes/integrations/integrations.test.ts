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
      await database.collection('generated_scrapers').deleteMany({});
      await database.collection('scraper_generation_jobs').deleteMany({});
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

  describe('POST /api/integrations/generate-scraper', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .post('/api/integrations/generate-scraper')
        .send({
          platformName: 'OtherLMS',
          loginUrl: 'https://example.edu/login',
          loginMethod: 'form',
        });
      expect(response.status).toBe(401);
    });

    it('returns 400 when missing platformName, loginUrl, or loginMethod', async () => {
      const response = await request(app)
        .post('/api/integrations/generate-scraper')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ platformName: 'Canvas' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('returns 200 with knownPlatform and reference code for known platform (Canvas)', async () => {
      const response = await request(app)
        .post('/api/integrations/generate-scraper')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          platformName: 'Canvas',
          loginUrl: 'https://canvas.example.edu',
          loginMethod: 'form',
        });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.knownPlatform).toBe(true);
      expect(response.body.scraperId).toBeNull();
      expect(response.body.jobId).toBeNull();
      expect(response.body.code).toBeDefined();
      expect(response.body.code.scraper).toContain('Reference scraper for Canvas');
    });

    it('returns 200 with jobId for unknown platform (queued)', async () => {
      const response = await request(app)
        .post('/api/integrations/generate-scraper')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          platformName: 'UnknownLMS',
          loginUrl: 'https://unknown.example.edu/login',
          loginMethod: 'form',
        });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.jobId).toBeDefined();
      expect(typeof response.body.jobId).toBe('string');
      expect(response.body.status).toBe('queued');
    });
  });

  describe('GET /api/integrations/generate-status', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .get('/api/integrations/generate-status?jobId=some-id')
        .send();
      expect(response.status).toBe(401);
    });

    it('returns 400 when jobId is missing', async () => {
      const response = await request(app)
        .get('/api/integrations/generate-status')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('jobId');
    });

    it('returns 404 when job not found', async () => {
      const response = await request(app)
        .get('/api/integrations/generate-status?jobId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Job not found');
    });

    it('returns 200 with status and result when job is ready', async () => {
      if (!database) return;
      const user = await database.collection('users').findOne({ email: 'integrations@example.com' });
      if (!user) throw new Error('Test user not found');
      const userId = (user._id as import('mongodb').ObjectId).toString();
      const jobId = 'test-ready-job-id';
      await database.collection('scraper_generation_jobs').insertOne({
        jobId,
        userId,
        platformName: 'TestPlatform',
        loginUrl: 'https://test.edu',
        cacheKey: 'abc',
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [],
        result: {
          scraperId: '507f1f77bcf86cd799439011',
          scraperCode: '// test',
          transformerCode: '// test',
          metadata: '{}',
        },
      });
      const response = await request(app)
        .get(`/api/integrations/generate-status?jobId=${encodeURIComponent(jobId)}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe(jobId);
      expect(response.body.status).toBe('ready');
      expect(response.body.result).toBeDefined();
      expect(response.body.result.scraperId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('POST /api/integrations/scraper-download', () => {
    it('downloading a bundle does not revoke unrelated scraper tokens', async () => {
      if (!database) return;
      const user = await database.collection('users').findOne({ email: 'integrations@example.com' });
      if (!user) throw new Error('Test user not found');
      const userId = (user._id as import('mongodb').ObjectId).toString();
      const revokedColl = database.collection('revoked_connector_tokens');
      await revokedColl.deleteMany({ userId });
      await revokedColl.insertOne({
        userId,
        jti: 'single-platform-jti',
        tokenPurpose: 'scraper',
        createdAt: new Date(),
        revokedAt: null,
      });
      const bundleRes = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          connections: [
            {
              platformId: 'canvas',
              platformName: 'Canvas',
              loginUrl: 'https://canvas.example.edu',
              credentials: { username: 'u', password: 'p' },
            },
          ],
        });
      expect(bundleRes.status).toBe(200);
      const scraperTokenDoc = await revokedColl.findOne({
        userId,
        tokenPurpose: 'scraper',
        jti: 'single-platform-jti',
      });
      expect(scraperTokenDoc).not.toBeNull();
      expect(scraperTokenDoc?.['revokedAt']).toBeNull();
    });

    it('returns 200 and script with scraperId (single-platform)', async () => {
      if (!database) return;
      const user = await database.collection('users').findOne({ email: 'integrations@example.com' });
      if (!user) throw new Error('Test user not found');
      const insertResult = await database.collection('generated_scrapers').insertOne({
        platformName: 'TestPlatform',
        loginUrl: 'https://test.edu',
        scraperCode: '// custom scraper',
        transformerCode: '// transformer',
        metadata: '{}',
        cacheKey: 'test-key',
        createdAt: new Date(),
      });
      const scraperId = insertResult.insertedId.toString();
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          scraperId,
          credentials: { studentName: 'Test', username: 'u', password: 'p' },
        });
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/x-sh|octet-stream/);
      expect(response.headers['content-disposition']).toContain('scholaracle-testplatform.command');
      const script = response.text;
      expect(script).toContain('ts-node');
      expect(script).toContain('run.js');
      expect(script).toContain('scraper.ts');
      expect(script).toContain('// custom scraper');
    });

    it('returns 200 and script with platform + url (reference path)', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          platform: 'Canvas',
          url: 'https://canvas.example.edu',
          credentials: { studentName: 'Student', username: 'u', password: 'p' },
        });
      expect(response.status).toBe(200);
      expect(response.text).toContain('Reference scraper for Canvas');
      expect(response.text).toContain('run.js');
    });

    it('returns 400 when neither scraperId, platform, nor connections/students provided', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ os: 'mac' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('scraperId');
    });

    it('returns 404 when scraperId is not found', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          scraperId: '507f1f77bcf86cd799439011',
          credentials: { username: 'u', password: 'p' },
        });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Scraper not found');
    });

    it('returns 200 and bundle script with payload.json and run.js for connections', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          connections: [
            {
              platformId: 'canvas',
              platformName: 'Canvas',
              loginUrl: 'https://canvas.example.edu',
              credentials: { username: 'u', password: 'p' },
            },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('scholaracle-bundle.command');
      const script = response.text;
      expect(script).toContain('payload.json');
      expect(script).toContain('run.js');
      expect(script).toContain('Canvas');
    });

    it('returns 200 and multi-student script when body.students is provided', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          os: 'mac',
          students: [
            {
              studentId: 'stu-1',
              studentName: 'Alice',
              platforms: [
                {
                  platform: 'Canvas',
                  loginUrl: 'https://canvas.example.edu',
                  credentials: { studentName: 'Alice', username: 'alice@test.com', password: 'secret' },
                },
              ],
            },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain('scholaracle-sync.command');
      const script = response.text;
      expect(script).toContain('payload.json');
      expect(script).toContain('run.js');
    });

    it('returns 400 when useAllStudents is true but user has no students with platforms', async () => {
      const response = await request(app)
        .post('/api/integrations/scraper-download')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ os: 'mac', useAllStudents: true });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/No students or platforms/);
    });
  });
});
