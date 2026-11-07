import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';

const SKELETON_HASH = 'b'.repeat(64);

const aeriesCoverage = {
  students: [
    {
      studentExternalId: 'stu-1',
      courses: 2,
      coursesWithGrade: 1,
      coursesWithAssignments: 1,
      attendanceRows: 0,
      teacherEmails: 0,
      gaps: [{ course: 'Entrepreneurship', kind: 'no_grade_no_assignments' as const }],
    },
  ],
};

describe('repair candidates on ingest complete', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let connectorToken: string;
  const sourceId = 'src-aeries-repair';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    database = mongoClient.db('repair-on-complete-test');

    process.env['CONNECTOR_JWT_SECRET'] = 'test-secret-connector';
    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register(
      'repair-candidate@test.com',
      'password123',
      'Repair User'
    );
    if (!reg.success || !reg.token) throw new Error('register failed');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1',
      ingestV1Router({
        database,
        jwtSecret: 'test-secret',
        connectorJwtSecret: 'test-secret-connector',
      })
    );
    app.use(createErrorHandler());

    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode: start.body.userCode });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode });
    connectorToken = poll.body.connectorToken as string;

    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        provider: 'aeries',
        adapterId: 'com.aeries.portal',
        displayName: 'Aeries',
        portalBaseUrl: 'https://district.aeries.net/student/',
      });
  }, 60_000);

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('repair_candidates').deleteMany({});
    await database.collection('slc_runs').deleteMany({});
  });

  it('dedupes two completes with the same skeleton hash into seenCount 2', async () => {
    for (let i = 0; i < 2; i++) {
      const run = await request(app)
        .post('/api/ingest/v1/runs')
        .set('Authorization', `Bearer ${connectorToken}`)
        .send({ sourceId });
      expect(run.status).toBe(200);
      const runId = run.body.runId as string;

      // Since the run state machine (#77), a run must be uploaded before it can complete.
      const now = new Date().toISOString();
      const upload = await request(app)
        .post(`/api/ingest/v1/runs/${runId}/envelope`)
        .set('Authorization', `Bearer ${connectorToken}`)
        .send({
          schemaVersion: 'slc.ingest.v1',
          run: {
            runId,
            startedAt: now,
            provider: 'aeries',
            adapterId: 'com.aeries.portal',
            adapterVersion: '1.0.0',
            mode: 'delta',
            timezone: 'America/Chicago',
          },
          source: {
            sourceId,
            displayName: 'Aeries',
            portalBaseUrl: 'https://district.aeries.net/student/',
          },
          ops: [],
        });
      expect(upload.status).toBe(200);

      const complete = await request(app)
        .post(`/api/ingest/v1/runs/${runId}/complete`)
        .set('Authorization', `Bearer ${connectorToken}`)
        .send({ status: 'success', coverage: aeriesCoverage, skeletonHash: SKELETON_HASH });
      expect(complete.status).toBe(200);
      expect(complete.body.committed).toBe(true);
    }

    const count = await database.collection('repair_candidates').countDocuments();
    expect(count).toBe(1);
    const row = await database.collection('repair_candidates').findOne({
      portalHost: 'district.aeries.net',
      gapKind: 'no_grade_no_assignments',
    });
    expect(row?.['seenCount']).toBe(2);
    expect(row?.['step']).toBe('aeries.gradebook.assignments');
    expect(row?.['recipeId']).toBe('aeries');
  });
});
