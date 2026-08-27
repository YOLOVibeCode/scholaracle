/**
 * Slice 5: student JWT can load Today + work pack; parent cannot;
 * sibling assignments 404 (same owner partition, different student).
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { assertNoGradeLeak, parseTodayView, parseWorkPackView } from '@scholaracle/contracts';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA, DEMO_STUDENT_USER_LIAM } from '../seed/demo-data';
import { studioRouter } from './studio';

const CELL_DIVISION_ID = 'demo-emma-ap-bio-a5';
const MISSING_ALG2_1 = 'demo-emma-alg2-missing-1';
const LIAM_ASSIGNMENT_ID = 'demo-liam-math7-a0';

describe('GET /api/studio — student session', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let emmaToken: string;
  let liamToken: string;
  let parentToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-slice5');
    authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
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

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined) {
      throw new Error('Emma student login failed');
    }
    emmaToken = emma.token;

    const liam = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    if (!liam.success || liam.token === undefined) {
      throw new Error('Liam student login failed');
    }
    liamToken = liam.token;

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined) {
      throw new Error('Parent login failed');
    }
    parentToken = parent.token;
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('returns Today for Emma without grades; Cell Division is in the list', async () => {
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseTodayView(res.body);
    assertNoGradeLeak(view, false);
    expect(view.encouragement).toMatch(/Nice work on /);
    expect(JSON.stringify(res.body)).not.toMatch(/\d+\s*%/);
    expect(JSON.stringify(res.body)).not.toMatch(/\b[ABCDF][+-](?!\w)/);
    const ids = [
      view.next?.assignmentExternalId,
      ...view.alsoToday.map((step) => step.assignmentExternalId),
    ];
    expect(ids).toContain(CELL_DIVISION_ID);
    expect(view.next).not.toBeNull();
    expect(view.next?.assignmentExternalId).toBe(MISSING_ALG2_1);
    expect(view.next?.primaryCtaLabel).toBe('Open worksheet');
  });

  it('forbids a parent JWT on Today', async () => {
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns Emma’s Cell Division pack with a signed hosted file', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${CELL_DIVISION_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseWorkPackView(res.body);
    assertNoGradeLeak(view, false);
    expect(view.instructionsText).toMatch(/Cell Division/);
    expect(view.humanStatus).toBe('Not turned in');
    expect(view.primaryAsset).not.toBeNull();
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    expect(view.primaryAsset?.assetId).toBe('demo-asset-demo-emma-ap-bio-lab-safety');
    expect(view.primaryAsset?.contentHash).toBe('demo-demo-emma-ap-bio-lab-safety-hash');
    expect(view.primaryAsset?.downloadUrl).toMatch(
      /\/api\/assets\/demo-asset-demo-emma-ap-bio-lab-safety/
    );
    const downloadUrl = view.primaryAsset?.downloadUrl ?? '';
    const ticket = new URL(downloadUrl);
    expect(ticket.searchParams.get('sig')).toMatch(/^[a-f0-9]{64}$/);
    const exp = Number(ticket.searchParams.get('exp'));
    const now = Math.floor(Date.now() / 1000);
    expect(exp).toBeGreaterThan(now);
    expect(exp).toBeLessThanOrEqual(now + 24 * 60 * 60 + 5);
    expect(view.moreFromCourse.some((item) => /syllabus/i.test(item.title))).toBe(true);
  });

  it('returns Missing assignment 1 pack with the Algebra formula sheet', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${MISSING_ALG2_1}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseWorkPackView(res.body);
    expect(view.title).toMatch(/Missing assignment 1/);
    expect(view.primaryAsset).not.toBeNull();
    expect(view.primaryAsset?.fileName).toBe('formulas.pdf');
    expect(view.primaryAsset?.downloadUrl).toMatch(
      /\/api\/assets\/demo-asset-demo-emma-alg2-formula/
    );
    expect(JSON.stringify(res.body)).not.toMatch(/\d+\s*%/);
  });

  it('404s Liam’s assignment for Emma (same owner partition)', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${LIAM_ASSIGNMENT_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('404s Emma’s Cell Division pack for Liam (same owner partition)', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${CELL_DIVISION_ID}`)
      .set('Authorization', `Bearer ${liamToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns Liam’s own assignment pack', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${LIAM_ASSIGNMENT_ID}`)
      .set('Authorization', `Bearer ${liamToken}`);
    expect(res.status).toBe(200);
    const view = parseWorkPackView(res.body);
    assertNoGradeLeak(view, false);
  });

  it('forbids a parent JWT on a work pack', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${CELL_DIVISION_ID}`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lets Emma PATCH working_on_it on her assignment', async () => {
    const res = await request(app)
      .patch(`/api/studio/assignments/${CELL_DIVISION_ID}/status`)
      .set('Authorization', `Bearer ${emmaToken}`)
      .send({ status: 'working_on_it' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, studentStatus: 'working_on_it' });

    const stored = await database.collection('slc_assignments').findOne({
      externalId: CELL_DIVISION_ID,
    });
    expect(stored?.['studentStatus']).toBe('working_on_it');
  });

  it('forbids a parent JWT from PATCHing studio status', async () => {
    const res = await request(app)
      .patch(`/api/studio/assignments/${CELL_DIVISION_ID}/status`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ status: 'done' });
    expect(res.status).toBe(403);
  });

  it('ignores a client showGrades flip on studio PATCH; Today still has no scores', async () => {
    const patch = await request(app)
      .patch(`/api/studio/assignments/${CELL_DIVISION_ID}/status`)
      .set('Authorization', `Bearer ${emmaToken}`)
      .send({ status: 'working_on_it', showGrades: true });
    expect(patch.status).toBe(200);

    const today = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(today.status).toBe(200);
    const view = parseTodayView(today.body);
    assertNoGradeLeak(view, false);
    expect(JSON.stringify(today.body)).not.toMatch(/\d+\s*%/);
  });

  it('403s Today when the student login binding is missing', async () => {
    await database
      .collection('students')
      .updateOne({ studentId: 'demo-emma' }, { $unset: { studentLogin: '' } });
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(403);
    await request(app).post('/api/seed/demo');
  });
});
