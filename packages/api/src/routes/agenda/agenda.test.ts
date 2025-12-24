import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { agendaRouter } from './agenda';

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
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_event_series').deleteMany({});
    await database.collection('agenda_overrides').deleteMany({});

    authService = new AuthService(database);
    const reg = await authService.register('agenda@test.com', 'password123', 'Agenda User');
    if (!reg.success || !reg.token) throw new Error('Failed to create agenda test user');
    testToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/agenda', agendaRouter({ database }));
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('returns agenda items for range', async () => {
    const now = new Date();
    const inOneDay = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const userId = (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ?? 'unknown';

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
});


