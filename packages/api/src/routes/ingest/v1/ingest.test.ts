import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from './ingest';

describe('Ingest v1 API', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let userToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    // Clean collections used by ingest
    await database.collection('users').deleteMany({ email: 'slc-user@test.com' });
    await database.collection('slc_device_auth').deleteMany({});
    await database.collection('slc_sources').deleteMany({});
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_event_series').deleteMany({});
    await database.collection('slc_event_overrides').deleteMany({});

    authService = new AuthService(database, 'test-secret');
    const reg = await authService.register('slc-user@test.com', 'password123', 'SLC User');
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('supports device flow and ingestion run', async () => {
    // Start device flow
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    expect(start.status).toBe(200);
    expect(start.body.deviceCode).toBeDefined();
    expect(start.body.userCode).toBeDefined();

    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;

    // Approve with user JWT
    const approve = await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });
    expect(approve.status).toBe(200);

    // Poll and receive connector token
    const poll1 = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    expect(poll1.status).toBe(200);
    expect(poll1.body.status).toBe('approved');
    expect(poll1.body.connectorToken).toBeDefined();

    const connectorToken = poll1.body.connectorToken as string;

    // Register source
    const source = await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-1',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Test Source',
        portalBaseUrl: 'https://example.edu',
      });
    expect(source.status).toBe(200);

    // Start run
    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-1' });
    expect(run.status).toBe(200);
    expect(run.body.runId).toBeDefined();

    const runId = run.body.runId as string;

    // Upload delta envelope with assignment + eventSeries
    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: { sourceId: 'src-1', displayName: 'Test Source', portalBaseUrl: 'https://example.edu' },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-1',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: { title: 'HW 1', dueAt: now, status: 'missing', pointsPossible: 10, pointsEarned: 0 },
        },
        {
          op: 'upsert',
          entity: 'eventSeries',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'series-1',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
          },
          observedAt: now,
          record: {
            title: 'Weekly Quiz',
            category: 'quiz',
            timezone: 'America/Los_Angeles',
            startsAt: '2025-09-05T08:00:00',
            endsAt: '2025-09-05T08:30:00',
            recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=FR', count: 3 },
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
      .send({ cursor: { type: 'opaque', value: 'cursor-1' } });
    expect(complete.status).toBe(200);

    // Verify persisted entities
    const assignmentCount = await database.collection('slc_assignments').countDocuments({});
    expect(assignmentCount).toBeGreaterThan(0);
  });
});


