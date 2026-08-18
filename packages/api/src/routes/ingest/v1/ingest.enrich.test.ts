/**
 * Ingest envelope join-gap enrichment — integration (off / shadow / apply).
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from './ingest';
import type { EnrichOpsMode } from './enrichOps';
import { createErrorHandler } from '../../../middleware/errorHandler';

describe('Ingest v1 envelope enrichment', () => {
  let database: Db;
  let mongoClient: MongoClient;
  let userToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'enrich-ops@test.com' });
    await database.collection('slc_device_auth').deleteMany({});
    await database.collection('slc_sources').deleteMany({ sourceId: /^src-enrich-/ });
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_courses').deleteMany({ 'key.externalId': 'skyward-course-ENR' });
    await database
      .collection('slc_attendance_events')
      .deleteMany({ 'key.externalId': /^att-enrich-/ });

    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register('enrich-ops@test.com', 'password123', 'Enrich User');
    if (!reg.success || !reg.token) throw new Error('Failed to register enrich test user');
    userToken = reg.token;
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  function makeApp(mode: EnrichOpsMode): Express {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1',
      ingestV1Router({ database, jwtSecret: 'test-secret', enrichOpsMode: mode })
    );
    app.use(createErrorHandler());
    return app;
  }

  async function connectorToken(app: Express): Promise<string> {
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode: start.body.userCode as string });
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode as string });
    return poll.body.connectorToken as string;
  }

  async function uploadGappedEnvelope(
    app: Express,
    sourceId: string,
    attendanceId: string
  ): Promise<void> {
    const token = await connectorToken(app);
    await request(app).post('/api/ingest/v1/sources').set('Authorization', `Bearer ${token}`).send({
      sourceId,
      provider: 'skyward',
      adapterId: 'com.skyward.grade',
      displayName: 'Enrich Source',
    });
    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceId });
    const runId = runRes.body.runId as string;
    const now = new Date().toISOString();
    const baseKey = {
      provider: 'skyward',
      adapterId: 'com.skyward.grade',
      studentExternalId: 'stu-enrich',
      institutionExternalId: 'inst-enrich',
    };
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'skyward',
        adapterId: 'com.skyward.grade',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
      },
      source: { sourceId, displayName: 'Enrich Source' },
      ops: [
        {
          op: 'upsert',
          entity: 'course',
          key: { ...baseKey, externalId: 'skyward-course-ENR' },
          observedAt: now,
          record: { title: 'ALGEBRA 1', period: '1', teacherName: 'Smith' },
        },
        {
          op: 'upsert',
          entity: 'attendanceEvent',
          key: { ...baseKey, externalId: attendanceId },
          observedAt: now,
          record: { date: '2026-01-10', status: 'present', periodName: '1' },
        },
      ],
    };
    const res = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${token}`)
      .send(envelope);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
  }

  it('off leaves attendance courseExternalId empty', async () => {
    const app = makeApp('off');
    await uploadGappedEnvelope(app, 'src-enrich-off', 'att-enrich-off');
    const doc = await database.collection('slc_attendance_events').findOne({
      externalId: 'att-enrich-off',
    });
    expect(doc).toBeTruthy();
    const record = doc?.['record'] as Record<string, unknown>;
    expect(record['courseExternalId']).toBeUndefined();
  });

  it('shadow leaves attendance courseExternalId empty (does not write patches)', async () => {
    const app = makeApp('shadow');
    await uploadGappedEnvelope(app, 'src-enrich-shadow', 'att-enrich-shadow');
    const doc = await database.collection('slc_attendance_events').findOne({
      externalId: 'att-enrich-shadow',
    });
    expect(doc).toBeTruthy();
    const record = doc?.['record'] as Record<string, unknown>;
    expect(record['courseExternalId']).toBeUndefined();
  });

  it('apply writes attendance courseExternalId from the matching course period', async () => {
    const app = makeApp('apply');
    await uploadGappedEnvelope(app, 'src-enrich-apply', 'att-enrich-apply');
    const doc = await database.collection('slc_attendance_events').findOne({
      externalId: 'att-enrich-apply',
    });
    expect(doc).toBeTruthy();
    const record = doc?.['record'] as Record<string, unknown>;
    expect(record['courseExternalId']).toBe('skyward-course-ENR');
    expect(doc?.['courseExternalId']).toBe('skyward-course-ENR');
  });
});
