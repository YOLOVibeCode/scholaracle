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
      source: {
        sourceId: 'src-1',
        displayName: 'Test Source',
        portalBaseUrl: 'https://example.edu',
      },
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
          record: {
            title: 'HW 1',
            dueAt: now,
            status: 'missing',
            pointsPossible: 10,
            pointsEarned: 0,
          },
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

  // ---------------------------------------------------------------------------
  // Helper: perform full device flow and return a connector token
  // ---------------------------------------------------------------------------
  async function getConnectorToken(): Promise<string> {
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });
    const poll = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    return poll.body.connectorToken as string;
  }

  // ---------------------------------------------------------------------------
  // 1. Poll with missing deviceCode
  // ---------------------------------------------------------------------------
  it('returns 400 on poll with missing deviceCode', async () => {
    const res = await request(app).post('/api/ingest/v1/device/poll').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deviceCode/i);
  });

  // ---------------------------------------------------------------------------
  // 2. Poll with non-existent deviceCode
  // ---------------------------------------------------------------------------
  it('returns 404 on poll with non-existent deviceCode', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/expired|not found/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Approve with missing userCode
  // ---------------------------------------------------------------------------
  it('returns 400 on approve with missing userCode', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userCode/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Approve without auth
  // ---------------------------------------------------------------------------
  it('returns 401 on approve without auth', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/approve')
      .send({ userCode: 'AAAA-BBBB' });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 5. Source registration with missing fields
  // ---------------------------------------------------------------------------
  it('returns 400 on source registration with missing fields', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  // ---------------------------------------------------------------------------
  // 6. List sources for authenticated connector
  // ---------------------------------------------------------------------------
  it('lists sources for authenticated connector', async () => {
    const connectorToken = await getConnectorToken();

    // Register a source first
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-list-test',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'List Test Source',
        portalBaseUrl: 'https://example.edu',
      });

    // List sources and verify
    const res = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sources)).toBe(true);
    const found = res.body.sources.find(
      (s: { sourceId?: string }) => s.sourceId === 'src-list-test'
    );
    expect(found).toBeDefined();
    expect(found.displayName).toBe('List Test Source');
  });

  // ---------------------------------------------------------------------------
  // 7. Start run with missing sourceId
  // ---------------------------------------------------------------------------
  it('returns 400 on start run with missing sourceId', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sourceId/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Validates envelope successfully
  // ---------------------------------------------------------------------------
  it('validates envelope successfully', async () => {
    const connectorToken = await getConnectorToken();

    // Start a run so we have a valid runId
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-validate',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Validate Source',
        portalBaseUrl: 'https://example.edu',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-validate' });
    const runId = runRes.body.runId as string;

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
      source: {
        sourceId: 'src-validate',
        displayName: 'Validate Source',
        portalBaseUrl: 'https://example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-validate',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: {
            title: 'Validate HW',
            dueAt: now,
            status: 'submitted',
            pointsPossible: 10,
            pointsEarned: 8,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/ingest/v1/validate')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(res.status).toBe(200);
    expect(res.body.validated).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 9. Rejects invalid envelope on validate
  // ---------------------------------------------------------------------------
  it('rejects invalid envelope on validate', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/validate')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ schemaVersion: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.validated).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 10. Envelope with runId mismatch
  // ---------------------------------------------------------------------------
  it('returns 400 on envelope with runId mismatch', async () => {
    const connectorToken = await getConnectorToken();

    // Register source and start a run
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-mismatch',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Mismatch Source',
        portalBaseUrl: 'https://example.edu',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-mismatch' });
    const runId = runRes.body.runId as string;

    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId: 'wrong-run-id',
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId: 'src-mismatch',
        displayName: 'Mismatch Source',
        portalBaseUrl: 'https://example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-mismatch',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: {
            title: 'Mismatch HW',
            dueAt: now,
            status: 'submitted',
            pointsPossible: 10,
            pointsEarned: 5,
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('runId mismatch');
  });
});
