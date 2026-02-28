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
    app.use('/api/students', authMiddleware(authService), studentsRouter({ database, baseUrl }));
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
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

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
      interface IBucketItem {
        assignmentExternalId: string;
        assets: Array<{ assetId: string; downloadUrl: string }>;
      }
      const buckets = res.body.buckets as Array<{
        id: string;
        label: string;
        count: number;
        items: IBucketItem[];
      }>;
      const bucketIds = buckets.map((b) => b.id);
      expect(bucketIds).toContain('needs_attention');
      expect(bucketIds).toContain('due_soon');
      expect(bucketIds).toContain('in_progress');
      expect(bucketIds).toContain('recently_graded');
      expect(bucketIds).toContain('caught_up');

      const needsAttention = buckets.find((b) => b.id === 'needs_attention');
      expect(needsAttention).toBeDefined();
      expect(needsAttention!.items.some((i) => i.assignmentExternalId === 'a-missing')).toBe(true);
      const dueSoon = buckets.find((b) => b.id === 'due_soon');
      expect(dueSoon).toBeDefined();
      expect(dueSoon!.items.some((i) => i.assignmentExternalId === 'a-due-soon')).toBe(true);
      const recentlyGraded = buckets.find((b) => b.id === 'recently_graded');
      expect(recentlyGraded).toBeDefined();
      expect(recentlyGraded!.items.some((i) => i.assignmentExternalId === 'a-graded')).toBe(true);
    });

    it('should join assets to items and include downloadUrl', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Asset Student', grade: 10 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

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
      interface IAssetBucketItem {
        assignmentExternalId: string;
        assets: Array<{ assetId: string; downloadUrl: string }>;
      }
      const buckets = res.body.buckets as Array<{ items: IAssetBucketItem[] }>;
      const allItems = buckets.flatMap((b) => b.items);
      const item = allItems.find((i) => i.assignmentExternalId === 'a-with-asset');
      expect(item).toBeDefined();
      expect(item!.assets).toBeDefined();
      expect(item!.assets.length).toBeGreaterThanOrEqual(1);
      expect(
        item!.assets.some(
          (a) => a.assetId === assetId && a.downloadUrl.includes(`/api/assets/${assetId}`)
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
      expect(
        buckets.every((b) => b.count === 0 && Array.isArray(b.items) && b.items.length === 0)
      ).toBe(true);
    });
  });

  describe('GET /api/students/:id/grade-history', () => {
    beforeEach(async () => {
      if (database) {
        await database.collection('slc_grade_history').deleteMany({});
        await database.collection('slc_grade_history_archive').deleteMany({});
        await database.collection('slc_courses').deleteMany({});
        await database.collection('slc_academic_terms').deleteMany({});
      }
    });

    it('should return 401 without token', async () => {
      const id = new ObjectId().toString();
      const res = await request(app).get(`/api/students/${id}/grade-history`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get(`/api/students/${new ObjectId().toString()}/grade-history`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return 200 with studentId and courses from slc_grade_history', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'History Student', grade: 10, studentId: 'ext-stu-1' });
      const studentDbId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_courses').insertMany([
        { userId, externalId: 'course-1', courseExternalId: 'course-1', record: { title: 'Math' } },
        {
          userId,
          externalId: 'course-2',
          courseExternalId: 'course-2',
          record: { title: 'Science' },
        },
      ]);
      await database.collection('slc_grade_history').insertMany([
        {
          userId,
          studentExternalId: 'ext-stu-1',
          courseExternalId: 'course-1',
          date: '2025-02-01',
          percentGrade: 88,
          provider: 'canvas',
        },
        {
          userId,
          studentExternalId: 'ext-stu-1',
          courseExternalId: 'course-1',
          date: '2025-02-08',
          percentGrade: 90,
          provider: 'canvas',
        },
        {
          userId,
          studentExternalId: 'ext-stu-1',
          courseExternalId: 'course-2',
          date: '2025-02-01',
          percentGrade: 72,
          provider: 'canvas',
        },
      ]);

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.studentId).toBe(studentDbId);
      expect(Array.isArray(res.body.courses)).toBe(true);
      expect(res.body.courses).toHaveLength(2);
      const byCourse = (
        res.body.courses as Array<{
          courseExternalId: string;
          courseName: string;
          snapshots: unknown[];
        }>
      ).reduce(
        (acc, c) => {
          acc[c.courseExternalId] = c;
          return acc;
        },
        {} as Record<string, { courseName: string; snapshots: unknown[] }>
      );
      expect(byCourse['course-1']!.courseName).toBe('Math');
      expect(byCourse['course-1']!.snapshots).toHaveLength(2);
      expect(byCourse['course-2']!.courseName).toBe('Science');
      expect(byCourse['course-2']!.snapshots).toHaveLength(1);
    });

    it('should filter by from and to when query params provided', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Range Student', grade: 9, studentId: 'ext-range' });
      const studentDbId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_courses').insertOne({
        userId,
        externalId: 'c1',
        courseExternalId: 'c1',
        record: { title: 'Algebra' },
      });
      await database.collection('slc_grade_history').insertMany([
        {
          userId,
          studentExternalId: 'ext-range',
          courseExternalId: 'c1',
          date: '2025-01-15',
          percentGrade: 80,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-range',
          courseExternalId: 'c1',
          date: '2025-02-01',
          percentGrade: 82,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-range',
          courseExternalId: 'c1',
          date: '2025-02-15',
          percentGrade: 85,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-range',
          courseExternalId: 'c1',
          date: '2025-03-01',
          percentGrade: 88,
          provider: 'test',
        },
      ]);

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?from=2025-02-01&to=2025-02-28`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.courses).toHaveLength(1);
      expect(res.body.courses[0].snapshots).toHaveLength(2);
      const dates = (res.body.courses[0].snapshots as Array<{ date: string }>).map((s) => s.date);
      expect(dates).toContain('2025-02-01');
      expect(dates).toContain('2025-02-15');
    });

    it('should filter by course when course query param provided', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Course Filter Student', grade: 11, studentId: 'ext-cf' });
      const studentDbId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_courses').insertMany([
        { userId, externalId: 'c-a', courseExternalId: 'c-a', record: { title: 'Art' } },
        { userId, externalId: 'c-b', courseExternalId: 'c-b', record: { title: 'Biology' } },
      ]);
      await database.collection('slc_grade_history').insertMany([
        {
          userId,
          studentExternalId: 'ext-cf',
          courseExternalId: 'c-a',
          date: '2025-02-01',
          percentGrade: 95,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-cf',
          courseExternalId: 'c-b',
          date: '2025-02-01',
          percentGrade: 78,
          provider: 'test',
        },
      ]);

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?course=c-b`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.courses).toHaveLength(1);
      expect(res.body.courses[0].courseExternalId).toBe('c-b');
      expect(res.body.courses[0].courseName).toBe('Biology');
    });

    it('should return 400 when from is not YYYY-MM-DD', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Date Student', grade: 9, studentId: 'ext-date' });
      const studentDbId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?from=02-01-2025`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/from|date|YYYY-MM-DD/i);
    });

    it('should return 400 when to is not YYYY-MM-DD', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Date Student 2', grade: 9, studentId: 'ext-date2' });
      const studentDbId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?to=invalid`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/to|date|YYYY-MM-DD/i);
    });

    it('should return 400 when from is after to', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Range Student 2', grade: 9, studentId: 'ext-range2' });
      const studentDbId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?from=2025-06-01&to=2025-01-01`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/from.*to|range|before/i);
    });

    it('should return 200 when from and to are valid YYYY-MM-DD', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Valid Date Student', grade: 10, studentId: 'ext-valid' });
      const studentDbId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentDbId}/grade-history?from=2025-01-01&to=2025-12-31`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.studentId).toBe(studentDbId);
      expect(Array.isArray(res.body.courses)).toBe(true);
    });
  });

  describe('DELETE /api/students/:id/grade-history', () => {
    beforeEach(async () => {
      if (database) {
        await database.collection('slc_grade_history').deleteMany({});
        await database.collection('slc_grade_history_archive').deleteMany({});
      }
    });

    it('should return 401 without token', async () => {
      const id = new ObjectId().toString();
      const res = await request(app).delete(`/api/students/${id}/grade-history?before=2025-07-01`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .delete(`/api/students/${new ObjectId().toString()}/grade-history?before=2025-07-01`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 when before param missing or invalid', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Archive Student', grade: 10, studentId: 'ext-arch' });
      const studentDbId = createRes.body.id as string;

      const resMissing = await request(app)
        .delete(`/api/students/${studentDbId}/grade-history`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(resMissing.status).toBe(400);

      const resBad = await request(app)
        .delete(`/api/students/${studentDbId}/grade-history?before=invalid`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(resBad.status).toBe(400);
    });

    it('should return 400 when student has no external id', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'No External Id', grade: 9 });
      const studentDbId = createRes.body.id as string;

      const res = await request(app)
        .delete(`/api/students/${studentDbId}/grade-history?before=2025-07-01`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('external id');
    });

    it('should move matching docs to archive and return archived count', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Archive Me', grade: 10, studentId: 'ext-archive-1' });
      const studentDbId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_grade_history').insertMany([
        {
          userId,
          studentExternalId: 'ext-archive-1',
          courseExternalId: 'c1',
          date: '2025-01-01',
          percentGrade: 70,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-archive-1',
          courseExternalId: 'c1',
          date: '2025-06-15',
          percentGrade: 75,
          provider: 'test',
        },
        {
          userId,
          studentExternalId: 'ext-archive-1',
          courseExternalId: 'c1',
          date: '2025-07-02',
          percentGrade: 80,
          provider: 'test',
        },
      ]);

      const res = await request(app)
        .delete(`/api/students/${studentDbId}/grade-history?before=2025-07-01`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.archived).toBe(2);

      const remaining = await database
        .collection('slc_grade_history')
        .find({ userId, studentExternalId: 'ext-archive-1' })
        .toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!['date']).toBe('2025-07-02');

      const archived = await database
        .collection('slc_grade_history_archive')
        .find({ userId, studentExternalId: 'ext-archive-1' })
        .toArray();
      expect(archived).toHaveLength(2);
      expect(archived.every((d) => d['archivedAt'] != null)).toBe(true);
    });
  });

  describe('GET /api/students/:id/grades', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Grades Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app).get(`/api/students/${studentId}/grades`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/students/507f1f77bcf86cd799439011/grades')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 200 with studentId, courseGrades array, and overallGPA when no SLC data', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'No SLC Student', grade: 10 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/grades`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.studentId).toBe(studentId);
      expect(res.body.studentName).toBe('No SLC Student');
      expect(Array.isArray(res.body.courseGrades)).toBe(true);
      expect(res.body.courseGrades).toHaveLength(0);
      expect(typeof res.body.overallGPA).toBe('number');
      expect(res.body.atRiskCourses).toBe(0);
    });
  });

  describe('GET /api/students/:id/sources', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Sources Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app).get(`/api/students/${studentId}/sources`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/students/507f1f77bcf86cd799439011/sources')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return empty array when student has no data sources', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'No Sources Student', grade: 11 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('POST /api/students/:id/sources', () => {
    it('should create a data source and return 201', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'With Source Student', grade: 9 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .post(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas LMS',
          dataTypes: ['assignments', 'grades'],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.pluginId).toBe('com.instructure.canvas');
      expect(res.body.provider).toBe('canvas');
      expect(res.body.displayName).toBe('Canvas LMS');
      expect(res.body.enabled).toBe(true);

      const listRes = await request(app)
        .get(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(1);
      expect(listRes.body[0].id).toBe(res.body.id);
    });

    it('should return 400 when body invalid (missing dataTypes)', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .post(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/students/:id/alerts', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Alerts Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app).get(`/api/students/${studentId}/alerts`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/students/507f1f77bcf86cd799439011/alerts')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 200 with array of alerts for student', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student With Alerts', grade: 10 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/alerts`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /api/students/invites/pending', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/students/invites/pending');
      expect(res.status).toBe(401);
    });

    it('should return empty array when no email query param', async () => {
      const res = await request(app)
        .get('/api/students/invites/pending')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('should return empty array when user has no pending invites for email', async () => {
      const res = await request(app)
        .get('/api/students/invites/pending?email=noinvites@example.com')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('GET /api/students/:id/parents', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app).get(`/api/students/${studentId}/parents`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/students/507f1f77bcf86cd799439011/parents')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return 200 with owner parent', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Multi Parent Student', grade: 10 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/parents`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const owner = res.body.find((p: { isOwner: boolean }) => p.isOwner);
      expect(owner).toBeDefined();
      expect(owner.isAdmin).toBe(true);
      expect(owner.status).toBe('accepted');
    });
  });

  describe('POST /api/students/:id/parents/invite', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app)
        .post(`/api/students/${studentId}/parents/invite`)
        .send({ email: 'invite@example.com', role: 'parent' });
      expect(res.status).toBe(401);
    });

    it('should return 400 when email missing', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .post(`/api/students/${studentId}/parents/invite`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ role: 'parent' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/students/:id/parents/:email', () => {
    it('should return 401 without token', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id;
      const res = await request(app).delete(`/api/students/${studentId}/parents/other@example.com`);
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .delete('/api/students/507f1f77bcf86cd799439011/parents/other@example.com')
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/students/:id/contacts', () => {
    it('should return 200 with owner and contacts list', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Contact Test Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const res = await request(app)
        .get(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toMatchObject({ isOwner: true, status: 'accepted' });
    });
  });

  describe('POST /api/students/:id/contacts', () => {
    it('should create pending contact and return 201', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const res = await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'newcontact@example.com', name: 'New Contact', role: 'parent' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.contact).toMatchObject({
        email: 'newcontact@example.com',
        status: 'pending',
        receiveAlerts: true,
      });
    });

    it('should return 409 when contact email already exists', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'dup@example.com', role: 'parent' });
      const res = await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'dup@example.com', role: 'guardian' });
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/students/:id/owner-alert-prefs', () => {
    it('should update owner alert prefs and return 200', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const res = await request(app)
        .put(`/api/students/${studentId}/owner-alert-prefs`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ receiveAlerts: true, alertChannels: ['email', 'sms'] });
      expect(res.status).toBe(200);
      expect(res.body.ownerAlertPrefs).toMatchObject({
        receiveAlerts: true,
        alertChannels: ['email', 'sms'],
      });
    });
  });

  describe('POST /api/students/:id/contacts/accept', () => {
    it('should return 404 when no pending invite for email', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const res = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'nopending@example.com' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/students/:id/contacts/:email', () => {
    it('should remove contact and return 200', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'toremove@example.com', role: 'parent' });
      const res = await request(app)
        .delete(`/api/students/${studentId}/contacts/toremove@example.com`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      const listRes = await request(app)
        .get(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`);
      const found = listRes.body.find(
        (c: { email?: string }) => c.email === 'toremove@example.com'
      );
      expect(found).toBeUndefined();
    });
  });
});
