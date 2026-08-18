import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';
import { agendaRouter } from './agenda';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Agenda API', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'agenda@test.com' });
    await database.collection('students').deleteMany({ studentId: 'student-ext-1' });
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_event_series').deleteMany({});
    await database.collection('agenda_overrides').deleteMany({});

    authService = new AuthService(database);
    const reg = await authService.register('agenda@test.com', 'password123', 'Agenda User');
    if (!reg.success || !reg.token || !reg.user?.id) {
      throw new Error('Failed to create agenda test user');
    }
    testToken = reg.token;

    // Agenda queries slc_* by student.dataUserId(); assignments without a student never surface.
    const studentRepo = new StudentRepository(database);
    await studentRepo.create({
      userId: reg.user.id,
      name: 'Agenda Student',
      grade: 9,
      studentId: 'student-ext-1',
    });

    app = express();
    app.use(express.json());
    app.use('/api/agenda', agendaRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('returns agenda items for range', async () => {
    const now = new Date();
    const inOneDay = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    // Insert a course first
    await database.collection('slc_courses').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'course-ext-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { name: 'Algebra I' },
    });

    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'HW', dueAt: inOneDay },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    // Verify course name is resolved
    const assignment = res.body.data.items.find((item: any) => item.type === 'assignment');
    expect(assignment).toBeDefined();
    expect(assignment.courseName).toBe('Algebra I');
  });

  it('returns 400 when from/to params missing', async () => {
    const res = await request(app).get('/api/agenda').set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing from/to ISO timestamps');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty items when no assignments exist', async () => {
    // Use a date range far in the past where no data exists
    const from = new Date('2000-01-01T00:00:00.000Z').toISOString();
    const to = new Date('2000-01-02T00:00:00.000Z').toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it('includes event series occurrences in agenda', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    const now = new Date();
    const startsAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    await database.collection('slc_event_series').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'series-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      deletedAt: null,
      record: {
        title: 'Weekly Quiz',
        category: 'quiz',
        timezone: 'America/Los_Angeles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        recurrence: { rrule: 'FREQ=WEEKLY;COUNT=4', count: 4 },
      },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const eventOccurrences = res.body.data.items.filter(
      (item: any) => item.type === 'event_occurrence'
    );
    expect(eventOccurrences.length).toBeGreaterThan(0);
    expect(eventOccurrences[0].title).toBe('Weekly Quiz');
  });

  it('snoozes an agenda item', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        itemType: 'assignment',
        itemKey: 'test-key',
        snoozedUntil: futureDate,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.snoozedUntil).toBeDefined();
  });

  it('returns 400 when snooze fields missing', async () => {
    const res = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing itemType/itemKey/snoozedUntil');
  });

  it('filters out snoozed assignments', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    const now = new Date();
    const dueAt = new Date(now.getTime() + 2 * 24 * 60 * 60_000).toISOString();
    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    // Insert an assignment due within the query window
    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-snooze-test',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'Snoozeable HW', dueAt },
    });

    // Verify it appears in the agenda
    const resBefore = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(resBefore.status).toBe(200);
    const beforeItems = resBefore.body.data.items.filter(
      (item: any) => item.title === 'Snoozeable HW'
    );
    expect(beforeItems.length).toBe(1);

    // Compute the item key (base64url of userId|provider|adapterId|externalId|dueAt)
    const itemKey = Buffer.from(
      `${userId}|fixture|com.scholaracle.fixture|assignment-snooze-test|${dueAt}`
    ).toString('base64url');

    // Snooze the assignment
    const snoozeRes = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        itemType: 'assignment',
        itemKey,
        snoozedUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      });

    expect(snoozeRes.status).toBe(200);
    expect(snoozeRes.body.success).toBe(true);

    // GET /api/agenda again - the snoozed item should be filtered out
    const resAfter = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(resAfter.status).toBe(200);
    const afterItems = resAfter.body.data.items.filter(
      (item: any) => item.title === 'Snoozeable HW'
    );
    expect(afterItems.length).toBe(0);
  });

  it('does not include aiSummary for a free-plan user (no subscription)', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    // Ensure user has no subscription (defaults to free plan — 0 AI agenda uses)
    await database.collection('subscriptions').deleteMany({ userId });
    await database
      .collection('users')
      .updateOne(
        { _id: new (await import('mongodb')).ObjectId(userId) },
        { $unset: { subscription: '' } }
      );

    const now = new Date();
    const dueAt = new Date(now.getTime() + 2 * 24 * 60 * 60_000).toISOString();
    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-ai-test',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'AI-Free HW', dueAt },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const aiItem = res.body.data.items.find((i: any) => i.title === 'AI-Free HW');
    expect(aiItem).toBeDefined();
    expect(aiItem.aiSummary).toBeUndefined();
  });

  it('returns 503 when reminder service not configured', async () => {
    const res = await request(app)
      .post('/api/agenda/remind')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ itemId: 'item-1', channel: 'email' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Reminder service');
  });
});
