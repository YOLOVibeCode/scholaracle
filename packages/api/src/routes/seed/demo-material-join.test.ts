/**
 * Demo seed must restore material → assignment joins on re-seed
 * without requiring /api/seed/demo/reset (which wipes other local data).
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedRouter } from './seed';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER } from './demo-data';

describe('Demo seed — material assignment joins', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('demo-material-join');

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('re-seed restores the Algebra formula sheet join without reset', async () => {
    const first = await request(app).post('/api/seed/demo');
    expect(first.status).toBe(200);

    const user = await database.collection('users').findOne({ email: DEMO_USER.email });
    expect(user?._id).toBeDefined();
    const userId = user!._id.toString();

    const unset = await database
      .collection('slc_course_materials')
      .updateOne(
        { userId, externalId: 'demo-emma-alg2-formula' },
        { $unset: { 'record.assignmentExternalId': '' } }
      );
    expect(unset.matchedCount).toBe(1);

    const stale = await database.collection('slc_course_materials').findOne({
      userId,
      externalId: 'demo-emma-alg2-formula',
    });
    expect((stale?.['record'] as Record<string, unknown>)['assignmentExternalId']).toBeUndefined();

    const second = await request(app).post('/api/seed/demo');
    expect(second.status).toBe(200);

    const restored = await database.collection('slc_course_materials').findOne({
      userId,
      externalId: 'demo-emma-alg2-formula',
    });
    expect((restored?.['record'] as Record<string, unknown>)['assignmentExternalId']).toBe(
      'demo-emma-alg2-missing-1'
    );
  });
});
