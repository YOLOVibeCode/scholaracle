/**
 * Tutorial manual override survives scrape updates on slc_courses; reset restores scraped value.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import { studentsRouter } from './students';
import { ingestV1Router } from '../ingest/v1/ingest';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Course tutorial override (integration)', () => {
  jest.setTimeout(60_000);
  const jwtSecret = 'test-jwt-secret-min-32-chars!!';
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let authService: AuthService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('course-tutorial-test');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret }));
    app.use(createErrorHandler());

    const reg = await authService.register('tutorial-parent@test.com', 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) {
      throw new Error('register failed');
    }
    token = reg.token;
    userId = reg.user.id;

    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan: 'family',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  async function ingestCourseTutorialUpsert(tutorialWindow: string): Promise<void> {
    const connectorToken = new ConnectorTokenService(jwtSecret).createToken(userId, randomJti());
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-ingest-tutorial',
        provider: 'skyward',
        adapterId: 'skyward-browser',
        displayName: 'Skyward',
        portalBaseUrl: 'https://skyward.example.edu',
      });
    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-ingest-tutorial' });
    expect(runRes.status).toBe(200);
    const runId = runRes.body.runId as string;
    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'skyward',
        adapterId: 'skyward-browser',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId: 'src-ingest-tutorial',
        displayName: 'Skyward',
        portalBaseUrl: 'https://skyward.example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: 'skyward',
            adapterId: 'skyward-browser',
            externalId: 'skyward-course-alg',
            studentExternalId: 'stu-ext-1',
          },
          observedAt: now,
          record: {
            title: 'Algebra 1',
            tutorialWindow,
            period: '3',
            daysOfWeek: [2, 4],
            startTime: '09:00',
            endTime: '09:50',
          },
        },
      ],
    };
    const upload = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(upload.status).toBe(200);
    const complete = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(complete.status).toBe(200);
  }

  function randomJti(): string {
    return `jti-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  it('manual tutorial persists after course record re-scrape; reset restores scraped value', async () => {
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tutorial Student', grade: 9, externalId: 'stu-ext-1' });
    expect(createRes.status).toBe(201);
    const studentId = createRes.body.id as string;

    const courseExternalId = 'skyward-course-alg';
    await database.collection('slc_courses').insertOne({
      userId,
      externalId: courseExternalId,
      provider: 'skyward',
      sourceId: 'src-1',
      studentExternalId: 'stu-ext-1',
      deletedAt: null,
      record: {
        title: 'Algebra 1',
        tutorialWindow: 'Tue/Thu 7:15–7:45 AM',
        period: '3',
        daysOfWeek: [2, 4],
        startTime: '09:00',
        endTime: '09:50',
      },
    });

    await database.collection('slc_grade_snapshots').insertOne({
      userId,
      studentId,
      studentExternalId: 'stu-ext-1',
      courseExternalId,
      provider: 'skyward',
      deletedAt: null,
      record: {
        courseExternalId,
        percentGrade: 92,
        asOfDate: '2026-09-20',
        sourceType: 'sis',
      },
    });

    await database.collection('slc_assignments').insertOne({
      userId,
      studentId,
      studentExternalId: 'stu-ext-1',
      courseExternalId,
      externalId: 'asg-1',
      provider: 'skyward',
      deletedAt: null,
      record: {
        title: 'HW 1',
        dueAt: '2026-09-22T12:00:00.000Z',
        status: 'graded',
        pointsPossible: 100,
        pointsEarned: 95,
      },
    });

    const gradesBefore = await request(app)
      .get(`/api/students/${studentId}/grades`)
      .set('Authorization', `Bearer ${token}`);
    expect(gradesBefore.status).toBe(200);
    const mergedCourseId = gradesBefore.body.courseGrades[0]?.courseExternalId as string;
    expect(gradesBefore.body.courseGrades[0]?.tutorialWindow).toBe('Tue/Thu 7:15–7:45 AM');

    const patchRes = await request(app)
      .patch(`/api/students/${studentId}/courses/${encodeURIComponent(mergedCourseId)}/tutorial`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tutorialWindow: 'Mon/Wed 8:00 AM (manual)' });
    expect(patchRes.status).toBe(200);

    await ingestCourseTutorialUpsert('Fri 7:00 AM (new scrape)');

    const gradesManual = await request(app)
      .get(`/api/students/${studentId}/grades`)
      .set('Authorization', `Bearer ${token}`);
    expect(gradesManual.body.courseGrades[0]?.tutorialWindow).toBe('Mon/Wed 8:00 AM (manual)');
    expect(gradesManual.body.courseGrades[0]?.isTutorialManual).toBe(true);

    const deleteRes = await request(app)
      .delete(`/api/students/${studentId}/courses/${encodeURIComponent(mergedCourseId)}/tutorial`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const gradesAfterReset = await request(app)
      .get(`/api/students/${studentId}/grades`)
      .set('Authorization', `Bearer ${token}`);
    expect(gradesAfterReset.body.courseGrades[0]?.tutorialWindow).toBe('Fri 7:00 AM (new scrape)');
    expect(gradesAfterReset.body.courseGrades[0]?.isTutorialManual).toBe(false);
  });
});
