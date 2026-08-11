/**
 * Contract tests for the /api/students read endpoints consumed by mobile
 * (and mirrored by web). These pin the EXACT key sets of populated
 * responses so any rename/add/remove fails CI before a client can drift.
 *
 * Wire types: @scholaracle/contracts types/api/{students,grades,actionBoard,sources}.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from '../routes/students/students';
import { authMiddleware } from '../middleware/auth';
import { createErrorHandler } from '../middleware/errorHandler';
import { assertKeys } from './assertExactKeys';

const EMAIL = 'contract-students@example.com';

describe('students API contract', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;
  let userId: string;
  let studentDbId: string;

  const SOURCE_ID = 'local-canvas-school-example-com';

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    authService = new AuthService(database);
    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      studentsRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());

    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({ email: EMAIL });
    await database.collection('slc_courses').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_grade_snapshots').deleteMany({});
    await database.collection('slc_sources').deleteMany({});
    await database.collection('slc_runs').deleteMany({});

    const registerResult = await authService.register(EMAIL, 'password123', 'Contract User');
    if (!registerResult.success || !registerResult.token || !registerResult.user?.id) {
      throw new Error('Failed to register contract test user');
    }
    testToken = registerResult.token;
    userId = registerResult.user.id;

    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan: 'family',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: now,
      updatedAt: now,
      events: [{ type: 'created', toPlan: 'family', timestamp: now }],
    });

    // Create the student through the API (matches production writes)
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Contract Student', grade: 9, studentId: 'contract-stu-1' });
    studentDbId = createRes.body.id as string;
    if (!studentDbId) throw new Error('Failed to create student');

    // Stats on the student (drives list `stats` + grades overallGPA)
    await database.collection('students').updateOne(
      { name: 'Contract Student' },
      {
        $set: {
          stats: { currentGPA: 91.2, totalAssignments: 4, missingAssignments: 1, onTimeRate: 0.9 },
          dataSources: [
            {
              id: SOURCE_ID,
              pluginId: 'com.instructure.canvas',
              enabled: true,
              schedule: 'every_6h',
              dataTypes: ['grades', 'assignments'],
              status: 'active',
            },
          ],
        },
      }
    );

    // Course + assignments (drives grades + action-board)
    const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    await database.collection('slc_courses').insertOne({
      userId,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      externalId: 'course-1',
      deletedAt: null,
      record: { name: 'Algebra' },
    });
    await database.collection('slc_assignments').insertMany([
      {
        userId,
        studentId: studentDbId,
        courseExternalId: 'course-1',
        externalId: 'a-graded',
        deletedAt: null,
        record: {
          title: 'Graded HW',
          status: 'graded',
          dueAt: dueSoon,
          pointsPossible: 10,
          pointsEarned: 9,
        },
      },
      {
        userId,
        studentId: studentDbId,
        courseExternalId: 'course-1',
        externalId: 'a-missing',
        deletedAt: null,
        record: { title: 'Missing HW', status: 'missing', dueAt: dueSoon },
      },
    ]);

    // IngestSource record (required for GET /:id/sources to list the source)
    await database.collection('slc_sources').insertOne({
      userId,
      sourceId: SOURCE_ID,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      displayName: 'Canvas (mobile)',
      portalBaseUrl: 'https://school.example.com',
      schedule: 'every_6h',
      dataTypes: ['grades'],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    // An ingest run (drives GET /:id/sources/:sourceId/runs)
    await database.collection('slc_runs').insertOne({
      userId,
      sourceId: SOURCE_ID,
      runId: 'run-contract-1',
      status: 'committed',
      startedAt: now,
      uploadedAt: now,
      committedAt: now,
      error: null,
      attempts: 1,
    });
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  it('GET /api/students — populated list item has the exact wire keys', async () => {
    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    const item = res.body[0] as Record<string, unknown>;
    // IStudentListItem: id/userId/name required; grade/studentId/stats optional
    assertKeys(item, ['id', 'userId', 'name'], ['grade', 'studentId', 'stats'], 'IStudentListItem');
    expect(item['id']).toBe(studentDbId);
    expect(typeof item['grade']).toBe('number');
    expect(item['studentId']).toBe('contract-stu-1');
    assertKeys(
      item['stats'] as Record<string, unknown>,
      [],
      ['currentGPA', 'totalAssignments', 'missingAssignments', 'onTimeRate', 'lastUpdated'],
      'IStudentStatsWire'
    );
  });

  it('GET /api/students/:id/grades — exact top-level and courseGrade keys', async () => {
    const res = await request(app)
      .get(`/api/students/${studentDbId}/grades`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['studentId', 'studentName', 'overallGPA', 'courseGrades', 'atRiskCourses'],
      ['aiOverview'],
      'IStudentGradesResponse'
    );
    expect(typeof res.body.overallGPA).toBe('number');
    expect(res.body.courseGrades.length).toBeGreaterThan(0);

    const course = res.body.courseGrades[0] as Record<string, unknown>;
    assertKeys(
      course,
      [
        'courseExternalId',
        'courseName',
        'officialGrade',
        'letterGrade',
        'gradeSource',
        'totalAssignments',
        'gradedAssignments',
        'missingAssignments',
        'lateAssignments',
        'totalPointsPossible',
        'totalPointsEarned',
        'recentTrend',
        'riskLevel',
        'materialCount',
        'assignments',
      ],
      ['gradeBreakdown', 'riskExplanation'],
      'ICourseGrade'
    );

    const assignment = (course['assignments'] as Record<string, unknown>[])[0]!;
    assertKeys(
      assignment,
      ['externalId', 'title', 'status', 'isOverdue'],
      [
        'dueAt',
        'pointsPossible',
        'pointsEarned',
        'weight',
        'category',
        'categoryWeight',
        'rubricScores',
        'attachments',
      ],
      'ICourseGradeAssignment'
    );
  });

  it('GET /api/students/:id/action-board — exact response/bucket/item keys', async () => {
    const res = await request(app)
      .get(`/api/students/${studentDbId}/action-board`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['studentId', 'studentName', 'buckets'],
      [],
      'IActionBoardResponse'
    );

    const buckets = res.body.buckets as Record<string, unknown>[];
    expect(buckets.length).toBe(5);
    for (const bucket of buckets) {
      assertKeys(bucket, ['id', 'label', 'count', 'items'], [], 'IActionBucket');
    }

    const allItems = buckets.flatMap((b) => b['items'] as Record<string, unknown>[]);
    expect(allItems.length).toBeGreaterThan(0);
    const item = allItems[0]!;
    assertKeys(
      item,
      ['assignmentExternalId', 'title', 'status', 'isOverdue', 'course', 'assets', 'materials'],
      ['dueAt', 'termExternalId', 'pointsPossible', 'pointsEarned'],
      'IActionItem'
    );
    assertKeys(
      item['course'] as Record<string, unknown>,
      ['externalId', 'name', 'riskLevel'],
      ['currentGrade', 'letterGrade'],
      'IActionItem.course'
    );
  });

  it('GET /api/students/:id/sources — exact source keys (requires IngestSource record)', async () => {
    const res = await request(app)
      .get(`/api/students/${studentDbId}/sources`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    assertKeys(
      res.body[0] as Record<string, unknown>,
      ['id', 'pluginId', 'provider', 'displayName', 'enabled', 'schedule', 'dataTypes', 'status'],
      ['portalBaseUrl', 'hasCredentials', 'lastScraped', 'lastSuccess', 'lastError'],
      'ISourceListItem'
    );
    expect(res.body[0].id).toBe(SOURCE_ID);
  });

  it('GET /api/students/:id/sources/:sourceId/runs — exact run keys', async () => {
    const res = await request(app)
      .get(`/api/students/${studentDbId}/sources/${SOURCE_ID}/runs`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    assertKeys(
      res.body[0] as Record<string, unknown>,
      ['runId', 'status', 'startedAt', 'error'],
      ['uploadedAt', 'committedAt'],
      'IRunListItem'
    );
    expect(res.body[0].runId).toBe('run-contract-1');
    expect(res.body[0].error).toBeNull();
  });

  it('error envelope — non-ObjectId student id yields the standard error body', async () => {
    const res = await request(app)
      .get('/api/students/not-an-objectid/grades')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(500);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'error', 'code'],
      ['requestId', 'details', 'debug'],
      'IErrorResponseBody'
    );
    expect(res.body.success).toBe(false);
  });
});
