/**
 * Slice 7 — parent nudges a student assignment.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA } from '../seed/demo-data';
import { studentsRouter } from './students';
import { studioRouter } from '../studio/studio';
import type { INotificationSink } from '@scholaracle/interfaces';

const CELL = 'demo-emma-ap-bio-a5';

describe('parent nudge API', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let parentToken: string;
  let emmaToken: string;
  let emmaId: string;
  const sink: INotificationSink & { sent: Array<{ audience: string }> } = {
    sent: [],
    async send(input) {
      this.sent.push({ audience: input.audience });
    },
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-slice7-nudge');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: 'test-secret',
        nudgeSink: sink,
      })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: 'test-secret',
      })
    );
    app.use(createErrorHandler());

    const seeded = await request(app).post('/api/seed/demo');
    expect(seeded.status).toBe(200);

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined) {
      throw new Error('Parent login failed');
    }
    parentToken = parent.token;

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined) {
      throw new Error('Emma student login failed');
    }
    emmaToken = emma.token;

    const list = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${parentToken}`);
    const emmaRow = (list.body as Array<{ id: string; studentId: string }>).find(
      (s) => s.studentId === 'demo-emma'
    );
    emmaId = emmaRow?.id ?? '';
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('nudges Emma’s Cell Division and surfaces lastNudgedAt on the action board', async () => {
    sink.sent.length = 0;
    const res = await request(app)
      .post(`/api/students/${emmaId}/assignments/${CELL}/nudge`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lastNudgedAt).toEqual(expect.any(String));
    expect(sink.sent).toEqual([{ audience: 'student' }]);

    const board = await request(app)
      .get(`/api/students/${emmaId}/action-board`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(board.status).toBe(200);
    const items = (
      board.body.buckets as Array<{
        items: Array<{ assignmentExternalId: string; lastNudgedAt?: string }>;
      }>
    ).flatMap((b) => b.items);
    const cell = items.find((i) => i.assignmentExternalId === CELL);
    expect(cell?.lastNudgedAt).toBe(res.body.lastNudgedAt);
  });

  it('rejects a second nudge the same calendar day', async () => {
    const res = await request(app)
      .post(`/api/students/${emmaId}/assignments/${CELL}/nudge`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(429);
  });

  it('rejects a student JWT', async () => {
    const res = await request(app)
      .post(`/api/students/${emmaId}/assignments/${CELL}/nudge`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(403);
  });
});
