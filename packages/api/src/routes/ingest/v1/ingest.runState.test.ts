import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { createIndexes } from '@scholaracle/database';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { seedBindingsForEnvelope } from '../../../test-utils/seedIngestBinding';

describe('Ingest v1 run state machine', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let userToken: string;
  let ownerUserId: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = `ingest_run_state_${Date.now()}`;

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await createIndexes(database);

    await database.collection('users').deleteMany({ email: 'run-state-user@test.com' });
    await database.collection('slc_device_auth').deleteMany({});
    await database.collection('slc_sources').deleteMany({});
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});

    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register('run-state-user@test.com', 'password123', 'Run State');
    if (!reg.success || !reg.token || !reg.user?.id)
      throw new Error('Failed to register test user');
    userToken = reg.token;
    ownerUserId = reg.user.id;

    app = express();
    app.use(express.json());
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
  });

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

  async function registerSource(connectorToken: string, sourceId: string): Promise<void> {
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Test Source',
        portalBaseUrl: 'https://example.edu',
      });
  }

  function minimalEnvelope(runId: string, sourceId: string) {
    const now = new Date().toISOString();
    return {
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
        sourceId,
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
            externalId: 'state-a-1',
            studentExternalId: 'stu-state-1',
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
      ],
    };
  }

  it('returns 409 when POST /runs reuses the same runId', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-dup-run');

    const first = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-dup-run', runId: 'client-run-dup-1' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-dup-run', runId: 'client-run-dup-1' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CONFLICT');
  });

  it('returns 404 on envelope when run was never started', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-no-run');
    const before = await database.collection('slc_assignments').countDocuments({});

    const res = await request(app)
      .post('/api/ingest/v1/runs/never-started-run/envelope')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(minimalEnvelope('never-started-run', 'src-no-run'));

    expect(res.status).toBe(404);
    const after = await database.collection('slc_assignments').countDocuments({});
    expect(after).toBe(before);
  });

  it('returns 409 on success complete without envelope', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-early-complete');

    const start = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-early-complete', runId: 'run-early-complete' });
    const runId = start.body.runId as string;

    const res = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');

    const doc = await database.collection('slc_runs').findOne({ runId });
    expect(doc?.['status']).toBe('started');
  });

  it('returns 409 on duplicate envelope upload', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-dup-env');

    const start = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-dup-env', runId: 'run-dup-env' });
    const runId = start.body.runId as string;
    const envelope = minimalEnvelope(runId, 'src-dup-env');
    await seedBindingsForEnvelope(database, ownerUserId, envelope);

    const first = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(second.status).toBe(409);
  });

  it('returns 409 on duplicate success complete', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-dup-complete');

    const start = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-dup-complete', runId: 'run-dup-complete' });
    const runId = start.body.runId as string;
    const envelope = minimalEnvelope(runId, 'src-dup-complete');
    await seedBindingsForEnvelope(database, ownerUserId, envelope);

    await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);

    const first = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(second.status).toBe(409);
  });

  it('still allows failed complete from started without envelope', async () => {
    const connectorToken = await getConnectorToken();
    await registerSource(connectorToken, 'src-fail-no-env');

    const start = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-fail-no-env', runId: 'run-fail-no-env' });
    const runId = start.body.runId as string;

    const res = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ status: 'failed', error: 'portal timeout' });
    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(true);
  });
});
