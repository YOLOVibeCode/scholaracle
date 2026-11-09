/**
 * R1 — `GET /api/studio/week`: student JWT sees owed / 7 days / done for its
 * own student, with no scores; parent JWT is refused; Today is unchanged.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { assertNoGradeLeak, parseTodayView, parseWeekView } from '@scholaracle/contracts';
import { MARKED_DONE_WARNING } from '@scholaracle/studio-core';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA, DEMO_STUDENT_USER_LIAM } from '../seed/demo-data';
import { API_TEST_SEED_TOKEN } from '../seed/seed-test-token';
import { studioRouter } from './studio';

const CELL_DIVISION_ID = 'demo-emma-ap-bio-a5';
const MISSING_ALG2_1 = 'demo-emma-alg2-missing-1';
const ESSAY_DRAFT_ID = 'demo-emma-eng10-a9';
const LIAM_MISSING_REPORT = 'demo-liam-la-a4';
const UPCOMING_ID = 'week-test-upcoming-in-5-days';
const NEXT_WEEK_ID = 'week-test-beyond-7-days';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('GET /api/studio/week — student session', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let emmaToken: string;
  let liamToken: string;
  let parentToken: string;
  let savedSeedToken: string | undefined;

  function postDemoSeed() {
    return request(app).post('/api/seed/demo').set('X-Seed-Token', API_TEST_SEED_TOKEN);
  }

  function getWeek(token: string) {
    return request(app).get('/api/studio/week').set('Authorization', `Bearer ${token}`);
  }

  function patchStatus(token: string, externalId: string, status: string | null) {
    return request(app)
      .patch(`/api/studio/assignments/${externalId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status });
  }

  async function insertEmmaOpenAssignment(externalId: string, dueAt: Date): Promise<void> {
    const emma = await database.collection('students').findOne({ studentId: 'demo-emma' });
    if (emma === null) throw new Error('Emma profile missing');
    await database.collection('slc_assignments').insertOne({
      userId: String(emma['userId']),
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId,
      studentExternalId: 'demo-emma',
      studentId: emma['_id'].toString(),
      courseExternalId: 'demo-emma-ap-bio',
      deletedAt: null,
      observedAt: new Date(),
      updatedAt: new Date(),
      record: {
        title: `Week test ${externalId}`,
        dueAt: dueAt.toISOString(),
        status: 'not_started',
        pointsPossible: 10,
      },
    });
  }

  beforeAll(async () => {
    savedSeedToken = process.env['SEED_TOKEN'];
    process.env['SEED_TOKEN'] = API_TEST_SEED_TOKEN;
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-week-r1');
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

    const seeded = await postDemoSeed();
    expect(seeded.status).toBe(200);

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined) throw new Error('Emma student login failed');
    emmaToken = emma.token;

    const liam = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    if (!liam.success || liam.token === undefined) throw new Error('Liam student login failed');
    liamToken = liam.token;

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined) throw new Error('Parent login failed');
    parentToken = parent.token;

    await insertEmmaOpenAssignment(UPCOMING_ID, new Date(Date.now() + 5 * DAY_MS));
    await insertEmmaOpenAssignment(NEXT_WEEK_ID, new Date(Date.now() + 9 * DAY_MS));
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
    if (savedSeedToken === undefined) delete process.env['SEED_TOKEN'];
    else process.env['SEED_TOKEN'] = savedSeedToken;
  });

  it('returns Emma’s week: owed oldest first, seven days, done this week, no scores', async () => {
    const res = await getWeek(emmaToken);
    expect(res.status).toBe(200);
    const view = parseWeekView(res.body);
    assertNoGradeLeak(view, false);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/\d+\s*%/);
    expect(json).not.toMatch(/\b[ABCDF][+-](?!\w)/);
    expect(json).not.toMatch(/pointsEarned|pointsPossible|letterGrade/);

    expect(view.encouragement).toMatch(/Nice work on /);

    const owedIds = view.owed.map((i) => i.assignmentExternalId);
    expect(owedIds[0]).toBe(MISSING_ALG2_1);
    expect(owedIds).toContain(CELL_DIVISION_ID);
    const owedDue = view.owed.map((i) => i.dueAt ?? '9999');
    expect([...owedDue].sort()).toEqual(owedDue);
    expect(view.owed.every((i) => i.studentStatus === 'not_started')).toBe(true);
    expect(view.owed.every((i) => i.warning === undefined)).toBe(true);

    expect(view.days).toHaveLength(7);
    expect(view.days[0]?.label).toBe('Today');
    expect(view.days[1]?.label).toBe('Tomorrow');
    expect(view.days.map((d) => d.date)).toEqual([...view.days.map((d) => d.date)].sort());

    const done = view.doneThisWeek.find((d) => d.assignmentExternalId === ESSAY_DRAFT_ID);
    expect(done).toEqual({
      assignmentExternalId: ESSAY_DRAFT_ID,
      title: 'Essay draft',
      courseName: 'English 10 Honors',
      dueAt: expect.any(String),
      confirmedBySchool: true,
    });

    expect(view.counts).toEqual({
      owed: view.owed.length,
      due: view.days.reduce((sum, d) => sum + d.items.length, 0),
      done: view.doneThisWeek.length,
    });
  });

  it('derives needs from the work-pack partition: Cell Division has a saved file and a public link', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const cell = view.owed.find((i) => i.assignmentExternalId === CELL_DIVISION_ID);
    expect(cell?.needs).toEqual(['saved_file', 'internet']);
    expect(cell?.primaryCtaLabel).toBe('Open worksheet');
    const alg = view.owed.find((i) => i.assignmentExternalId === MISSING_ALG2_1);
    expect(alg?.needs).toContain('saved_file');
  });

  it('shows open work due in 5 days as upcoming in a day bucket; 9 days out is absent', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const dayItems = view.days.flatMap((d) => d.items);
    const upcoming = dayItems.find((i) => i.assignmentExternalId === UPCOMING_ID);
    expect(upcoming).toBeDefined();
    expect(upcoming?.studentStatus).toBe('not_started');
    expect(upcoming?.needs).toEqual([]);
    expect(upcoming?.primaryCtaLabel).toBe('Open assignment');
    expect(view.owed.map((i) => i.assignmentExternalId)).not.toContain(UPCOMING_ID);
    expect(JSON.stringify(view)).not.toContain(NEXT_WEEK_ID);
  });

  it('a student-marked done item leaves its day and joins doneThisWeek until the school confirms', async () => {
    expect((await patchStatus(emmaToken, UPCOMING_ID, 'done')).status).toBe(200);
    const view = parseWeekView((await getWeek(emmaToken)).body);
    expect(view.days.flatMap((d) => d.items).map((i) => i.assignmentExternalId)).not.toContain(
      UPCOMING_ID
    );
    const done = view.doneThisWeek.find((d) => d.assignmentExternalId === UPCOMING_ID);
    expect(done?.confirmedBySchool).toBe(false);
    expect(view.doneThisWeek[0]?.assignmentExternalId).toBe(UPCOMING_ID);
    expect((await patchStatus(emmaToken, UPCOMING_ID, null)).status).toBe(200);
  });

  it('a missing item the student marked done stays owed with the warning', async () => {
    expect((await patchStatus(emmaToken, MISSING_ALG2_1, 'done')).status).toBe(200);
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const owed = view.owed.find((i) => i.assignmentExternalId === MISSING_ALG2_1);
    expect(owed?.studentStatus).toBe('done');
    expect(owed?.warning).toBe(MARKED_DONE_WARNING);
    expect(view.doneThisWeek.map((d) => d.assignmentExternalId)).not.toContain(MISSING_ALG2_1);
    expect((await patchStatus(emmaToken, MISSING_ALG2_1, 'need_help')).status).toBe(200);
    const after = parseWeekView((await getWeek(emmaToken)).body);
    const asking = after.owed.find((i) => i.assignmentExternalId === MISSING_ALG2_1);
    expect(asking?.studentStatus).toBe('need_help');
    expect(asking?.warning).toBeUndefined();
    expect((await patchStatus(emmaToken, MISSING_ALG2_1, null)).status).toBe(200);
  });

  it('Today is unchanged: still picks the missing Algebra item and ignores upcoming work', async () => {
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseTodayView(res.body);
    expect(view.next?.assignmentExternalId).toBe(MISSING_ALG2_1);
    expect(JSON.stringify(view)).not.toContain(UPCOMING_ID);
  });

  it('Liam’s week is Liam’s only (same owner partition)', async () => {
    const view = parseWeekView((await getWeek(liamToken)).body);
    const ids = JSON.stringify(view);
    expect(view.owed.map((i) => i.assignmentExternalId)).toContain(LIAM_MISSING_REPORT);
    expect(ids).not.toContain('demo-emma-');
    expect(ids).not.toContain(UPCOMING_ID);
    assertNoGradeLeak(view, false);
  });

  it('forbids a parent JWT', async () => {
    const res = await getWeek(parentToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('403s when the student login binding is missing', async () => {
    await database
      .collection('students')
      .updateOne({ studentId: 'demo-emma' }, { $unset: { studentLogin: '' } });
    expect((await getWeek(emmaToken)).status).toBe(403);
    await postDemoSeed();
  });
});
