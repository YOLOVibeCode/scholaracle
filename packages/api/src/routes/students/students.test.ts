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
    const baseUrl = 'http://test.example';
    app.use(
      '/api/students',
      authMiddleware(authService),
      studentsRouter({ database, baseUrl })
    );
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

  describe('GET /api/students/:id/action-board', () => {
    beforeEach(async () => {
      if (database) {
        await database.collection('slc_assignments').deleteMany({});
        await database.collection('slc_courses').deleteMany({});
        await database.collection('slc_grade_snapshots').deleteMany({});
        await database.collection('slc_course_materials').deleteMany({});
        await database.collection('slc_assets').deleteMany({});
      }
    });

    it('should return 401 without auth', async () => {
      const id = new ObjectId().toString();
      const res = await request(app).get(`/api/students/${id}/action-board`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const id = new ObjectId().toString();
      const res = await request(app)
        .get(`/api/students/${id}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return action board with buckets and correct bucket assignment', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Board Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const userId =
        (await database.collection('users').findOne({ email: 'students@example.com' }))?._id?.toString() ??
        '';

      const now = new Date();
      const dueIn24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const gradedAtRecent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'test',
        adapterId: 'com.test',
        externalId: 'course-1',
        deletedAt: null,
        record: { name: 'Math' },
      });
      await database.collection('slc_assignments').insertMany([
        {
          userId,
          studentId,
          courseExternalId: 'course-1',
          externalId: 'a-missing',
          deletedAt: null,
          record: { title: 'Missing HW', status: 'missing', dueAt: dueIn24h },
        },
        {
          userId,
          studentId,
          courseExternalId: 'course-1',
          externalId: 'a-due-soon',
          deletedAt: null,
          record: { title: 'Due Soon', status: 'in_progress', dueAt: dueIn24h },
        },
        {
          userId,
          studentId,
          courseExternalId: 'course-1',
          externalId: 'a-graded',
          deletedAt: null,
          record: {
            title: 'Graded',
            status: 'graded',
            gradedAt: gradedAtRecent,
            pointsPossible: 10,
            pointsEarned: 8,
          },
        },
      ]);

      const res = await request(app)
        .get(`/api/students/${studentId}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('studentId', studentId);
      expect(res.body).toHaveProperty('studentName', 'Board Student');
      expect(res.body).toHaveProperty('buckets');
      const buckets = res.body.buckets as Array<{ id: string; label: string; count: number; items: unknown[] }>;
      const bucketIds = buckets.map((b) => b.id);
      expect(bucketIds).toContain('needs_attention');
      expect(bucketIds).toContain('due_soon');
      expect(bucketIds).toContain('in_progress');
      expect(bucketIds).toContain('recently_graded');
      expect(bucketIds).toContain('caught_up');

      const needsAttention = buckets.find((b) => b.id === 'needs_attention');
      expect(needsAttention).toBeDefined();
      expect(needsAttention!.items.some((i: { assignmentExternalId: string }) => i.assignmentExternalId === 'a-missing')).toBe(true);
      const dueSoon = buckets.find((b) => b.id === 'due_soon');
      expect(dueSoon).toBeDefined();
      expect(dueSoon!.items.some((i: { assignmentExternalId: string }) => i.assignmentExternalId === 'a-due-soon')).toBe(true);
      const recentlyGraded = buckets.find((b) => b.id === 'recently_graded');
      expect(recentlyGraded).toBeDefined();
      expect(recentlyGraded!.items.some((i: { assignmentExternalId: string }) => i.assignmentExternalId === 'a-graded')).toBe(true);
    });

    it('should join assets to items and include downloadUrl', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Asset Student', grade: 10 });
      const studentId = createRes.body.id as string;
      const userId =
        (await database.collection('users').findOne({ email: 'students@example.com' }))?._id?.toString() ??
        '';

      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'test',
        adapterId: 'com.test',
        externalId: 'course-2',
        deletedAt: null,
        record: { name: 'Science' },
      });
      await database.collection('slc_assignments').insertOne({
        userId,
        studentId,
        courseExternalId: 'course-2',
        externalId: 'a-with-asset',
        deletedAt: null,
        record: { title: 'With Asset', status: 'submitted' },
      });
      const assetId = new ObjectId().toString();
      await database.collection('slc_assets').insertOne({
        assetId,
        sourceId: 'src-1',
        userId,
        originalUrl: 'https://example.com/file.pdf',
        storageKey: 'key',
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        fileSize: 100,
        contentHash: 'hash',
        uploadedAt: new Date(),
        lastAccessedAt: new Date(),
        entityType: 'assignment',
        entityExternalId: 'a-with-asset',
        deletedAt: null,
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const buckets = res.body.buckets as Array<{ items: Array<{ assets: Array<{ assetId: string; downloadUrl: string }> }> }>;
      const allItems = buckets.flatMap((b) => b.items);
      const item = allItems.find((i: { assignmentExternalId: string }) => i.assignmentExternalId === 'a-with-asset');
      expect(item).toBeDefined();
      expect(item.assets).toBeDefined();
      expect(item.assets.length).toBeGreaterThanOrEqual(1);
      expect(
        item.assets.some(
          (a: { assetId: string; downloadUrl: string }) =>
            a.assetId === assetId && a.downloadUrl.includes(`/api/assets/${assetId}`)
        )
      ).toBe(true);
    });

    it('should return empty buckets when student has no assignments', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Empty Student', grade: 11 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.studentId).toBe(studentId);
      expect(res.body.buckets).toBeDefined();
      const buckets = res.body.buckets as Array<{ count: number; items: unknown[] }>;
      expect(buckets.every((b) => b.count === 0 && Array.isArray(b.items) && b.items.length === 0)).toBe(true);
    });
  });
});
