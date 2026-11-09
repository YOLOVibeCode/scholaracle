import request from 'supertest';
import express, { type Express } from 'express';
import { ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { studentsRouter } from './students';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { closeTestApp, createTestApp } from '../../test-utils/createTestApp';

describe('Students API Routes', () => {
  let app: Express;
  let database: Db;
  let authService: AuthService;
  let testToken: string;
  let testHarness: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    testHarness = await createTestApp({
      skipOnConnectFailure: true,
      configure: ({ app: testApp, database: db }) => {
        database = db;
        app = testApp;
        authService = new AuthService(db);
        const baseUrl = 'http://test.example';
        testApp.use(
          '/api/students',
          authMiddleware(authService),
          requireParent,
          studentsRouter({ database: db, baseUrl })
        );
      },
    });
    if (!testHarness) {
      return;
    }
  });

  afterAll(async () => {
    if (testHarness) {
      await closeTestApp(testHarness);
    }
  });

  beforeEach(async () => {
    if (database) {
      // Clean up test data before each test
      await database.collection('students').deleteMany({});
      await database.collection('subscriptions').deleteMany({});
      await database.collection('users').deleteMany({ email: 'students@example.com' });
      await database.collection('users').deleteMany({ email: 'student-gate@example.com' });

      // Re-register test user for each test
      const registerResult = await authService.register(
        'students@example.com',
        'password123',
        'Students User'
      );
      if (registerResult.success && registerResult.user && registerResult.token) {
        testToken = registerResult.token;
        const userId = registerResult.user.id;
        if (userId) {
          const now = new Date();
          const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await database.collection('subscriptions').insertOne({
            userId,
            plan: 'family',
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            billingCycle: 'monthly',
            createdAt: now,
            updatedAt: now,
            events: [{ type: 'created', toPlan: 'family', timestamp: now }],
          });
        }
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

    it('rejects a student-role token with 403', async () => {
      const passwordHash = await UserRepository.hashPassword('password123');
      await new UserRepository(database).create({
        email: 'student-gate@example.com',
        passwordHash,
        name: 'Student Gate',
        role: 'student',
        studentId: new ObjectId().toString(),
      });
      const login = await authService.login('student-gate@example.com', 'password123');
      expect(login.success).toBe(true);

      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${login.token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
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
      expect(response.body.code).toBe('VALIDATION_ERROR');
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
        await database.collection('slc_academic_terms').deleteMany({});
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
        assets: Array<{ assetId: string; downloadUrl: string; contentHash?: string }>;
      }
      const buckets = res.body.buckets as Array<{ items: IAssetBucketItem[] }>;
      const allItems = buckets.flatMap((b) => b.items);
      const item = allItems.find((i) => i.assignmentExternalId === 'a-with-asset');
      expect(item).toBeDefined();
      expect(item!.assets).toBeDefined();
      expect(item!.assets.length).toBeGreaterThanOrEqual(1);
      expect(
        item!.assets.some(
          (a) =>
            a.assetId === assetId &&
            a.downloadUrl.includes(`/api/assets/${assetId}`) &&
            a.contentHash === 'hash'
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

    it('should put missing assignments in expired term into caught_up', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Expired Term Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_academic_terms').insertOne({
        userId,
        provider: 'canvas',
        adapterId: 'canvas-browser',
        externalId: 'canvas-term-fall-2025',
        deletedAt: null,
        record: {
          title: 'Fall 2025',
          startDate: '2025-08-01',
          endDate: '2025-12-31',
          type: 'semester',
        },
      });
      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'test',
        adapterId: 'com.test',
        externalId: 'course-exp',
        deletedAt: null,
        record: { name: 'Math' },
      });
      await database.collection('slc_assignments').insertOne({
        userId,
        studentId,
        courseExternalId: 'course-exp',
        externalId: 'a-expired-missing',
        deletedAt: null,
        record: {
          title: 'Old Missing',
          status: 'missing',
          dueAt: '2025-10-15T23:59:00Z',
          termExternalId: 'canvas-term-fall-2025',
        },
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const buckets = res.body.buckets as Array<{
        id: string;
        items: Array<{ assignmentExternalId: string }>;
      }>;
      const caughtUp = buckets.find((b) => b.id === 'caught_up');
      const needsAttention = buckets.find((b) => b.id === 'needs_attention');
      expect(caughtUp).toBeDefined();
      expect(caughtUp!.items.some((i) => i.assignmentExternalId === 'a-expired-missing')).toBe(
        true
      );
      expect(
        needsAttention?.items.some((i) => i.assignmentExternalId === 'a-expired-missing')
      ).toBe(false);
    });

    it('puts a need_help item in needs_attention even when only due soon, with askedForHelpAt and the note (R3)', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Help Student', grade: 8 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';
      const now = Date.now();
      const dueIn24h = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      const askedAt = new Date(now - 2 * 60 * 60 * 1000);

      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'test',
        adapterId: 'com.test',
        externalId: 'course-help',
        deletedAt: null,
        record: { name: 'Math' },
      });
      await database.collection('slc_assignments').insertMany([
        {
          userId,
          studentId,
          courseExternalId: 'course-help',
          externalId: 'a-help',
          deletedAt: null,
          studentStatus: 'need_help',
          studentHelpRequestedAt: askedAt,
          studentNote: "I don't get #7",
          record: { title: 'Ch. 5 problems', status: 'not_started', dueAt: dueIn24h },
        },
        {
          userId,
          studentId,
          courseExternalId: 'course-help',
          externalId: 'a-plain',
          deletedAt: null,
          studentStatus: 'working_on_it',
          record: { title: 'Ch. 6 problems', status: 'not_started', dueAt: dueIn24h },
        },
        {
          userId,
          studentId,
          courseExternalId: 'course-help',
          externalId: 'a-help-turned-in',
          deletedAt: null,
          studentStatus: 'need_help',
          studentHelpRequestedAt: askedAt,
          record: { title: 'Old ask', status: 'submitted', dueAt: dueIn24h },
        },
      ]);

      const res = await request(app)
        .get(`/api/students/${studentId}/action-board`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      const buckets = res.body.buckets as Array<{
        id: string;
        items: Array<{
          assignmentExternalId: string;
          studentStatus?: string;
          askedForHelpAt?: string;
          studentNote?: string;
        }>;
      }>;
      const byId = (id: string) => buckets.find((b) => b.id === id)!;
      const help = byId('needs_attention').items.find((i) => i.assignmentExternalId === 'a-help');
      expect(help).toBeDefined();
      expect(help!.studentStatus).toBe('need_help');
      expect(help!.askedForHelpAt).toBe(askedAt.toISOString());
      expect(help!.studentNote).toBe("I don't get #7");
      expect(byId('due_soon').items.some((i) => i.assignmentExternalId === 'a-help')).toBe(false);
      expect(byId('due_soon').items.some((i) => i.assignmentExternalId === 'a-plain')).toBe(true);
      // Once the portal shows the work in, a stale ask no longer demands attention.
      expect(
        byId('needs_attention').items.some((i) => i.assignmentExternalId === 'a-help-turned-in')
      ).toBe(false);
    });
  });

  describe('PUT /api/students/:id/assignments/:externalId/status (parent side, R3)', () => {
    async function seedAsk(): Promise<string> {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Put Student', grade: 7 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';
      await database.collection('slc_assignments').deleteMany({ externalId: 'a-put' });
      await database.collection('slc_assignments').insertOne({
        userId,
        studentId,
        courseExternalId: 'course-put',
        externalId: 'a-put',
        deletedAt: null,
        studentStatus: 'need_help',
        studentHelpRequestedAt: new Date(),
        studentNote: 'stuck on #3',
        studentNoteAt: new Date(),
        record: { title: 'Put HW', status: 'not_started' },
      });
      return studentId;
    }

    it('rejects need_help with 400: only the student can ask for help', async () => {
      const studentId = await seedAsk();
      const res = await request(app)
        .put(`/api/students/${studentId}/assignments/a-put/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ status: 'need_help' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body)).toMatch(/Only the student can ask for help/);
      const doc = await database.collection('slc_assignments').findOne({ externalId: 'a-put' });
      expect(doc?.['studentNote']).toBe('stuck on #3');
    });

    it('any other status is accepted and ends the ask (note and ask time cleared)', async () => {
      const studentId = await seedAsk();
      const res = await request(app)
        .put(`/api/students/${studentId}/assignments/a-put/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ status: 'working_on_it' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, studentStatus: 'working_on_it' });
      const doc = await database.collection('slc_assignments').findOne({ externalId: 'a-put' });
      expect(doc?.['studentStatus']).toBe('working_on_it');
      expect(doc?.['studentNote']).toBeUndefined();
      expect(doc?.['studentNoteAt']).toBeUndefined();
      expect(doc?.['studentHelpRequestedAt']).toBeUndefined();
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
      // POST /api/students now gives every new student an external id, so a legacy
      // row without one is inserted directly.
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'No External Id', grade: 9 });
      const studentDbId = createRes.body.id as string;
      await database
        .collection('students')
        .updateOne({ _id: new ObjectId(studentDbId) }, { $unset: { studentId: '' } });

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
    beforeEach(async () => {
      if (database) {
        await database.collection('slc_assignments').deleteMany({});
        await database.collection('slc_courses').deleteMany({});
        await database.collection('slc_grade_snapshots').deleteMany({});
      }
    });

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

    it('should include a course from grade snapshot when there are no assignments', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Snapshot Only Grades Student', grade: 10 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      const courseExternalId = 'm0-08-snap-only-course';
      const todayYMD = new Date().toISOString().slice(0, 10);
      const expectedPercent = 88;

      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'test',
        adapterId: 'com.test',
        externalId: courseExternalId,
        deletedAt: null,
        record: { name: 'History', title: 'History' },
      });

      await database.collection('slc_grade_snapshots').insertOne({
        userId,
        studentId,
        courseExternalId,
        provider: 'skyward',
        deletedAt: null,
        record: {
          courseExternalId,
          percentGrade: expectedPercent,
          asOfDate: todayYMD,
          sourceType: 'sis',
        },
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/grades`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.courseGrades).toHaveLength(1);
      const row = res.body.courseGrades[0] as {
        totalAssignments: number;
        officialGrade: number;
        gradeSource: string;
      };
      expect(row.totalAssignments).toBe(0);
      expect(row.officialGrade).toBe(expectedPercent);
      expect(row.gradeSource).toBe('sis');
    });

    it('prefers gradeSnapshot percentGrade over zeroed assignment computation', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Snapshot Vs Zero Assignments', grade: 10 });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      const courseExternalId = 'm2-08-lms-snap-course';
      const todayYMD = new Date().toISOString().slice(0, 10);
      const snapshotPercent = 92.1;
      const recentDue = new Date().toISOString();

      await database.collection('slc_courses').insertOne({
        userId,
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        externalId: courseExternalId,
        deletedAt: null,
        record: { name: 'Algebra', title: 'Algebra' },
      });

      await database.collection('slc_assignments').insertOne({
        userId,
        studentId,
        courseExternalId,
        externalId: 'a-zero-earned',
        deletedAt: null,
        record: {
          title: 'Homework 1',
          status: 'graded',
          pointsPossible: 100,
          pointsEarned: 0,
          dueAt: recentDue,
        },
      });

      await database.collection('slc_grade_snapshots').insertOne({
        userId,
        studentId,
        courseExternalId,
        provider: 'canvas',
        deletedAt: null,
        record: {
          courseExternalId,
          percentGrade: snapshotPercent,
          asOfDate: todayYMD,
          sourceType: 'lms',
        },
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/grades`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.courseGrades).toHaveLength(1);
      const row = res.body.courseGrades[0] as {
        officialGrade: number;
        gradeSource: string;
      };
      expect(row.officialGrade).toBe(snapshotPercent);
      expect(row.officialGrade).not.toBe(0);
      expect(row.gradeSource).toBe('lms');
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

    it('should call sendInviteEmail when configured after successful invite', async () => {
      const mockSendInvite = jest.fn().mockResolvedValue(undefined);
      const appWithInvite = express();
      appWithInvite.use(express.json());
      appWithInvite.use(
        '/api/students',
        authMiddleware(authService),
        studentsRouter({
          database,
          baseUrl: 'http://test.example',
          sendInviteEmail: { sendInvite: mockSendInvite },
        })
      );

      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Invite Email Student', grade: 9 });
      const studentId = createRes.body.id as string;

      const res = await request(appWithInvite)
        .post(`/api/students/${studentId}/parents/invite`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'parent@example.com', role: 'parent' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockSendInvite).toHaveBeenCalledTimes(1);
      expect(mockSendInvite).toHaveBeenCalledWith({
        to: 'parent@example.com',
        studentName: 'Invite Email Student',
        studentId,
        inviteEmail: 'parent@example.com',
        baseUrl: 'http://test.example',
      });
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

  describe('co-parent texts (self opt-in)', () => {
    async function createStudent(): Promise<string> {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'SMS Student', grade: 9 });
      return createRes.body.id as string;
    }

    beforeEach(async () => {
      await database.collection('sms_contact_optin_invites').deleteMany({});
      await database.collection('communication_logs').deleteMany({});
      await database.collection('sms_consents').deleteMany({});
    });

    it('texts nobody when a parent adds a co-parent with a phone, and returns a link to share', async () => {
      const studentId = await createStudent();
      const res = await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'coparent-sms@example.com',
          phone: '512-555-0142',
          alertChannels: ['email', 'sms'],
        });
      expect(res.status).toBe(201);
      expect(res.body.smsOptInUrl).toMatch(/^http:\/\/test\.example\/sms\/optin\/[a-f0-9]{48}$/);
      expect(res.body.contact.smsStatus).toBe('invited');
      expect(await database.collection('communication_logs').countDocuments({})).toBe(0);
      expect(
        await database.collection('sms_consents').countDocuments({ phoneE164: '+15125550142' })
      ).toBe(0);
    });

    it('returns no link for an email-only contact', async () => {
      const studentId = await createStudent();
      const res = await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'email-only@example.com' });
      expect(res.status).toBe(201);
      expect(res.body.smsOptInUrl).toBeUndefined();
      expect(res.body.contact.smsStatus).toBe('none');
    });

    it('lists each contact as invited until they opt in', async () => {
      const studentId = await createStudent();
      await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'listed@example.com', phone: '512-555-0143', alertChannels: ['sms'] });
      const res = await request(app)
        .get(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`);
      const listed = (res.body as { email?: string; smsStatus?: string }[]).find(
        (c) => c.email === 'listed@example.com'
      );
      expect(listed?.smsStatus).toBe('invited');
    });

    it('returns a fresh link when texts are turned on for an existing contact', async () => {
      const studentId = await createStudent();
      await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'later@example.com' });
      const res = await request(app)
        .put(`/api/students/${studentId}/contacts/${encodeURIComponent('later@example.com')}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ alertChannels: ['email', 'sms'] });
      expect(res.status).toBe(200);
      expect(res.body.smsOptInUrl).toMatch(/\/sms\/optin\/[a-f0-9]{48}$/);
      expect(await database.collection('communication_logs').countDocuments({})).toBe(0);
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
    it("refuses an email that is not the caller's, and returns 404 when the caller has no pending invite", async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Student', grade: 9 });
      const studentId = createRes.body.id as string;
      const foreign = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'nopending@example.com' });
      expect(foreign.status).toBe(403);
      const own = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});
      expect(own.status).toBe(404);
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

  describe('GET /api/students/:id/materials', () => {
    beforeEach(async () => {
      if (database) {
        await database.collection('slc_course_materials').deleteMany({});
        await database.collection('slc_courses').deleteMany({});
        await database.collection('slc_assets').deleteMany({});
      }
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/students/nonexistent/materials');
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .get(`/api/students/${new ObjectId()}/materials`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(404);
    });

    it('should return empty courses when student has no materials', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Materials Test Student' });
      const studentId = createRes.body.id as string;

      const res = await request(app)
        .get(`/api/students/${studentId}/materials`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalMaterials).toBe(0);
      expect(res.body.courses).toEqual([]);
    });

    it('should return materials grouped by course', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Materials Student 2' });
      const studentId = createRes.body.id as string;

      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_course_materials').insertMany([
        {
          userId,
          studentId,
          externalId: 'mat1',
          courseExternalId: 'course1',
          record: { title: 'Syllabus', type: 'syllabus', courseExternalId: 'course1' },
          deletedAt: null,
        },
        {
          userId,
          studentId,
          externalId: 'mat2',
          courseExternalId: 'course1',
          record: { title: 'Handout 1', type: 'handout', courseExternalId: 'course1' },
          deletedAt: null,
        },
      ]);

      await database.collection('slc_courses').insertOne({
        userId,
        externalId: 'course1',
        record: { title: 'AP Biology', name: 'AP Biology' },
        deletedAt: null,
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/materials`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalMaterials).toBe(2);
      expect(res.body.courses.length).toBe(1);
      expect(res.body.courses[0].courseName).toBe('AP Biology');
      expect(res.body.courses[0].materials.length).toBe(2);
    });

    it('includes contentHash from slc_assets on the material (not from the signed URL)', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Hash Materials Student' });
      const studentId = createRes.body.id as string;
      const userId =
        (
          await database.collection('users').findOne({ email: 'students@example.com' })
        )?._id?.toString() ?? '';

      await database.collection('slc_courses').insertOne({
        userId,
        externalId: 'course-hash',
        record: { title: 'AP Biology', name: 'AP Biology' },
        deletedAt: null,
      });
      await database.collection('slc_course_materials').insertOne({
        userId,
        studentId,
        externalId: 'demo-emma-ap-bio-lab-safety',
        courseExternalId: 'course-hash',
        record: {
          title: 'Lab Safety Handout',
          type: 'handout',
          courseExternalId: 'course-hash',
        },
        deletedAt: null,
      });
      await database.collection('slc_assets').insertOne({
        assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
        sourceId: 'demo',
        userId,
        originalUrl: 'https://demo.scholaracle.com/files/lab-safety.pdf',
        storageKey: 'demo/demo-asset-demo-emma-ap-bio-lab-safety',
        fileName: 'lab-safety.pdf',
        mimeType: 'application/pdf',
        fileSize: 200,
        contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
        entityType: 'courseMaterial',
        entityExternalId: 'demo-emma-ap-bio-lab-safety',
        deletedAt: null,
        uploadedAt: new Date(),
        lastAccessedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/materials`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      const material = (res.body.courses as Array<{ materials: Array<Record<string, unknown>> }>)[0]
        ?.materials[0];
      expect(material?.['contentHash']).toBe('demo-demo-emma-ap-bio-lab-safety-hash');
      expect(material?.['assetId']).toBe('demo-asset-demo-emma-ap-bio-lab-safety');
      const downloadUrl = material?.['downloadUrl'] as string | undefined;
      expect(downloadUrl).not.toContain('demo-demo-emma-ap-bio-lab-safety-hash');
    });
  });

  describe('POST /api/students/:id/contacts/:email/transfer-email', () => {
    it('should not leak tokens in response body', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Transfer Test Student' });
      const studentId = createRes.body.id;

      await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'old@example.com', role: 'parent' });

      const res = await request(app)
        .post(`/api/students/${studentId}/contacts/old@example.com/transfer-email`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ newEmail: 'new@example.com' });

      if (res.status === 200) {
        expect(res.body).not.toHaveProperty('_debug');
        expect(JSON.stringify(res.body)).not.toContain('Token');
        expect(JSON.stringify(res.body)).not.toContain('token');
      }
    });
  });

  describe('PUT /api/students/:id/sources/:sourceId/credentials — portal login rejected', () => {
    it('rejects authType:login with 400 (portal passwords not accepted by server)', async () => {
      if (!database) return;
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Cred Test Student' });
      expect(createRes.status).toBe(201);
      const studentId = createRes.body.id as string;

      const addRes = await request(app)
        .post(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas',
          portalBaseUrl: 'https://school.instructure.com',
          dataTypes: ['grades'],
        });
      expect(addRes.status).toBe(201);
      const sourceId = addRes.body.id as string;

      const res = await request(app)
        .put(`/api/students/${studentId}/sources/${sourceId}/credentials`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ authType: 'login', username: 'parent', password: 'secret' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/client|device|app|extension/i);
    });

    it('rejects authType:login for skyward with 400', async () => {
      if (!database) return;
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Skyward Cred Student' });
      expect(createRes.status).toBe(201);
      const studentId = createRes.body.id as string;

      const addRes = await request(app)
        .post(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          provider: 'skyward',
          adapterId: 'com.skyward.iscorp',
          displayName: 'Skyward',
          portalBaseUrl: 'https://school.skyward.com',
          dataTypes: ['grades'],
        });
      expect(addRes.status).toBe(201);
      const sourceId = addRes.body.id as string;

      const res = await request(app)
        .put(`/api/students/${studentId}/sources/${sourceId}/credentials`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ authType: 'login', username: 'parent', password: 'secret' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/students plan cap', () => {
    it('applies the free cap once the paid subscription is cancelled', async () => {
      const user = await database.collection('users').findOne({ email: 'students@example.com' });
      await database
        .collection('subscriptions')
        .updateOne({ userId: user!._id.toString() }, { $set: { status: 'cancelled' } });

      const first = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Kid One' });
      const second = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Kid Two' });

      expect(first.status).toBe(201);
      expect(first.body.studentId).toBe(first.body.id);
      expect(second.status).toBe(403);
      expect(second.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(second.body.currentPlan).toBe('free');
    });
  });

  describe('sharing security (S0)', () => {
    const CO = 'coparent-s0@example.com';
    const STRANGER = 'stranger-s0@example.com';
    let coToken: string;
    let strangerToken: string;

    beforeEach(async () => {
      await database.collection('users').deleteMany({ email: { $in: [CO, STRANGER] } });
      await database.collection('audit_logs').deleteMany({ entityType: 'student_sharing' });
      const co = await authService.register(CO, 'password123', 'Co Parent');
      const stranger = await authService.register(STRANGER, 'password123', 'Stranger');
      if (!co.token || !stranger.token) {
        throw new Error('Failed to register sharing test users');
      }
      coToken = co.token;
      strangerToken = stranger.token;
    });

    async function ownerCreatesStudentAndInvites(): Promise<string> {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Shared Kid', grade: 8 });
      expect(createRes.status).toBe(201);
      const studentId = createRes.body.id as string;
      const inviteRes = await request(app)
        .post(`/api/students/${studentId}/contacts`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: CO, name: 'Co Parent', role: 'parent' });
      expect(inviteRes.status).toBe(201);
      return studentId;
    }

    it('nobody can accept an invitation addressed to someone else', async () => {
      const studentId = await ownerCreatesStudentAndInvites();
      const hijack = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ email: CO });
      expect(hijack.status).toBe(403);
      const ownerTries = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: CO });
      expect(ownerTries.status).toBe(403);
      // A stranger with no invitation of their own gets "nothing pending", not someone else's invite.
      const strangerOwn = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({});
      expect(strangerOwn.status).toBe(404);
      const stillPending = await database
        .collection('students')
        .findOne({ _id: new ObjectId(studentId) });
      expect((stillPending?.['sharedWith'] as { status: string }[])[0]?.status).toBe('pending');
    });

    it('the invitee accepts with no email in the body, sees the student, and an audit row is written', async () => {
      const studentId = await ownerCreatesStudentAndInvites();
      const accept = await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${coToken}`)
        .send({});
      expect(accept.status).toBe(200);
      const list = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${coToken}`);
      expect(list.status).toBe(200);
      expect((list.body as { id: string }[]).map((s) => s.id)).toContain(studentId);
      const audit = await database
        .collection('audit_logs')
        .find({ entityType: 'student_sharing', entityId: studentId })
        .toArray();
      expect(audit.map((a) => a['action']).sort()).toEqual(['sharing:accept', 'sharing:invite']);
      // The audit store masks addresses; the actor is still identifiable by its first letter + domain.
      expect(audit.find((a) => a['action'] === 'sharing:accept')?.['adminEmail']).toMatch(
        /^c\*+@example\.com$/
      );
    });

    it('pending invites are listed for the caller only; a query email is ignored', async () => {
      const studentId = await ownerCreatesStudentAndInvites();
      const mine = await request(app)
        .get('/api/students/invites/pending')
        .set('Authorization', `Bearer ${coToken}`);
      expect(mine.status).toBe(200);
      expect((mine.body as { studentId: string }[]).map((i) => i.studentId)).toEqual([studentId]);
      const peek = await request(app)
        .get(`/api/students/invites/pending?email=${encodeURIComponent(CO)}`)
        .set('Authorization', `Bearer ${strangerToken}`);
      expect(peek.status).toBe(200);
      expect(peek.body).toEqual([]);
    });

    it('a member cannot edit, remove, or manage sources; an admin can edit; only the owner removes', async () => {
      const studentId = await ownerCreatesStudentAndInvites();
      await request(app)
        .post(`/api/students/${studentId}/contacts/accept`)
        .set('Authorization', `Bearer ${coToken}`)
        .send({});
      const asMember = (): request.Test => request(app).put(`/api/students/${studentId}`);
      expect(
        (await asMember().set('Authorization', `Bearer ${coToken}`).send({ name: 'X' })).status
      ).toBe(403);
      const removeAsMember = await request(app)
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${coToken}`);
      expect(removeAsMember.status).toBe(403);
      const addSource = await request(app)
        .post(`/api/students/${studentId}/sources`)
        .set('Authorization', `Bearer ${coToken}`)
        .send({
          provider: 'canvas',
          adapterId: 'canvas',
          displayName: 'Canvas',
          dataTypes: ['grades'],
        });
      expect(addSource.status).toBe(403);
      // Someone with no access at all gets 404, not 403 (no existence leak).
      const strangerEdit = await request(app)
        .put(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ name: 'X' });
      expect(strangerEdit.status).toBe(404);
      // Promote to admin: edit works, remove still does not.
      const promote = await request(app)
        .put(`/api/students/${studentId}/parents/${encodeURIComponent(CO)}/admin`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ isAdmin: true });
      expect(promote.status).toBe(200);
      const editAsAdmin = await request(app)
        .put(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${coToken}`)
        .send({ name: 'Renamed Kid' });
      expect(editAsAdmin.status).toBe(200);
      expect(editAsAdmin.body.name).toBe('Renamed Kid');
      const removeAsAdmin = await request(app)
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${coToken}`);
      expect(removeAsAdmin.status).toBe(403);
      const removeAsOwner = await request(app)
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(removeAsOwner.status).toBe(200);
    });

    it('/parents/accept applies the same identity rule', async () => {
      const createRes = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Parents Route Kid', grade: 5 });
      const studentId = createRes.body.id as string;
      const invite = await request(app)
        .post(`/api/students/${studentId}/parents/invite`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: STRANGER, role: 'guardian' });
      expect(invite.status).toBe(201);
      const wrongPerson = await request(app)
        .post(`/api/students/${studentId}/parents/accept`)
        .set('Authorization', `Bearer ${coToken}`)
        .send({ email: STRANGER });
      expect(wrongPerson.status).toBe(403);
      const rightPerson = await request(app)
        .post(`/api/students/${studentId}/parents/accept`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({});
      expect(rightPerson.status).toBe(200);
    });
  });
});
