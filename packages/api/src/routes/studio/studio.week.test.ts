/**
 * R1 — `GET /api/studio/week`: student JWT sees owed / 7 days / done for its
 * own student, with no scores; parent JWT is refused; Today is unchanged.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db, Document } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { assertNoGradeLeak, parseTodayView, parseWeekView } from '@scholaracle/contracts';
import {
  MARKED_DONE_WARNING,
  PAST_DUE_LABEL,
  atLocalHourOnCalendarDay,
  calendarDayKey,
} from '@scholaracle/studio-core';
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
const OVERDUE_ID = 'week-test-overdue-not-flagged';
const SUBMITTED_WITH_EVIDENCE_ID = 'week-test-submitted-yesterday';
const GRADED_LONG_AGO_ID = 'week-test-graded-ten-days-ago';
const STUDENT_DONE_THEN_SUBMITTED_ID = 'week-test-student-done-then-submitted';
const MIDNIGHT_ID = 'week-test-due-just-after-midnight';
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
  let clockOverride: Date | undefined;

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

  async function insertEmmaAssignment(
    externalId: string,
    record: Document,
    docFields: Document = {}
  ): Promise<void> {
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
      ...docFields,
      record: { title: `Week test ${externalId}`, pointsPossible: 10, ...record },
    });
  }

  async function ownerTimeZone(): Promise<string> {
    const owner = await database.collection('users').findOne({ email: DEMO_USER.email });
    return (owner?.['timezone'] as string | undefined) ?? 'America/New_York';
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
        clock: () => clockOverride ?? new Date(),
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

    const now = Date.now();
    await insertEmmaAssignment(UPCOMING_ID, {
      status: 'not_started',
      dueAt: new Date(now + 5 * DAY_MS).toISOString(),
    });
    await insertEmmaAssignment(NEXT_WEEK_ID, {
      status: 'not_started',
      dueAt: new Date(now + 9 * DAY_MS).toISOString(),
    });
    await insertEmmaAssignment(OVERDUE_ID, {
      status: 'in_progress',
      dueAt: new Date(now - 2 * DAY_MS).toISOString(),
    });
    // Padded, mixed-case status with a real submission instant: counts as done this week.
    await insertEmmaAssignment(SUBMITTED_WITH_EVIDENCE_ID, {
      status: ' Submitted ',
      dueAt: new Date(now - 1 * DAY_MS).toISOString(),
      submittedAt: new Date(now - 1 * DAY_MS + 60_000).toISOString(),
    });
    await insertEmmaAssignment(GRADED_LONG_AGO_ID, {
      status: 'graded',
      dueAt: new Date(now - 11 * DAY_MS).toISOString(),
      gradedAt: new Date(now - 10 * DAY_MS).toISOString(),
    });
    // Portal says submitted but gives no instant; the student had marked it done → updatedAt is the evidence.
    await insertEmmaAssignment(
      STUDENT_DONE_THEN_SUBMITTED_ID,
      { status: 'submitted', dueAt: new Date(now - 20 * DAY_MS).toISOString() },
      { studentStatus: 'done', updatedAt: new Date(now - 2 * 60 * 60 * 1000) }
    );
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

    const missing = view.owed.filter((i) => i.humanStatus === 'Not turned in');
    expect(missing[0]?.assignmentExternalId).toBe(MISSING_ALG2_1);
    expect(missing.map((i) => i.assignmentExternalId)).toContain(CELL_DIVISION_ID);
    const missingDue = missing.map((i) => i.dueAt ?? '9999');
    expect([...missingDue].sort()).toEqual(missingDue);
    expect(view.owed.every((i) => i.studentStatus === 'not_started')).toBe(true);
    expect(view.owed.every((i) => i.warning === undefined)).toBe(true);

    expect(view.days).toHaveLength(7);
    expect(view.days[0]?.label).toBe('Today');
    expect(view.days[1]?.label).toBe('Tomorrow');
    expect(view.days.map((d) => d.date)).toEqual([...view.days.map((d) => d.date)].sort());

    expect(view.counts).toEqual({
      owed: view.owed.length,
      due: view.days.reduce((sum, d) => sum + d.items.length, 0),
      done: view.doneThisWeek.length,
    });
  });

  it('past-due open work the school has not flagged is owed after the missing items as "Past due"', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const ids = view.owed.map((i) => i.assignmentExternalId);
    const overdueIndex = ids.indexOf(OVERDUE_ID);
    expect(overdueIndex).toBeGreaterThan(-1);
    const overdue = view.owed[overdueIndex];
    expect(overdue?.humanStatus).toBe(PAST_DUE_LABEL);
    expect(overdue?.humanStatus).toBe('Past due');
    expect(view.owed.slice(0, overdueIndex).every((i) => i.humanStatus === 'Not turned in')).toBe(
      true
    );
    expect(view.owed.slice(overdueIndex).every((i) => i.humanStatus === 'Past due')).toBe(true);
    expect(view.days.flatMap((d) => d.items).map((i) => i.assignmentExternalId)).not.toContain(
      OVERDUE_ID
    );
  });

  it('doneThisWeek needs evidence of when: submittedAt/gradedAt, or updatedAt when the student marked done', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const doneIds = view.doneThisWeek.map((d) => d.assignmentExternalId);
    expect(doneIds).toContain(SUBMITTED_WITH_EVIDENCE_ID);
    expect(doneIds).toContain(STUDENT_DONE_THEN_SUBMITTED_ID);
    expect(doneIds).not.toContain(GRADED_LONG_AGO_ID);
    // Seeded "submitted" with only a due date is not claimed as finished this week.
    expect(doneIds).not.toContain(ESSAY_DRAFT_ID);
    expect(view.doneThisWeek.every((d) => d.confirmedBySchool)).toBe(true);
    const submitted = view.doneThisWeek.find(
      (d) => d.assignmentExternalId === SUBMITTED_WITH_EVIDENCE_ID
    );
    expect(submitted).toEqual({
      assignmentExternalId: SUBMITTED_WITH_EVIDENCE_ID,
      title: `Week test ${SUBMITTED_WITH_EVIDENCE_ID}`,
      courseName: 'AP Biology',
      dueAt: expect.any(String),
      confirmedBySchool: true,
    });
  });

  it('derives needs from the work-pack partition: Cell Division has a saved file and a public link', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const cell = view.owed.find((i) => i.assignmentExternalId === CELL_DIVISION_ID);
    expect(cell?.needs).toEqual(['saved_file', 'internet']);
    expect(cell?.primaryCtaLabel).toBe('Open worksheet');
    const alg = view.owed.find((i) => i.assignmentExternalId === MISSING_ALG2_1);
    expect(alg?.needs).toContain('saved_file');
    expect(alg?.primaryCtaLabel).toBe('Open worksheet');
  });

  it('shows open work due in 5 days as upcoming in a day bucket; 9 days out is absent', async () => {
    const view = parseWeekView((await getWeek(emmaToken)).body);
    const dayItems = view.days.flatMap((d) => d.items);
    const upcoming = dayItems.find((i) => i.assignmentExternalId === UPCOMING_ID);
    expect(upcoming).toBeDefined();
    expect(upcoming?.humanStatus).toBe('Coming up');
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

  it("buckets days in the student login's own zone when one is stored, else the owner's (same rule as the weekly review)", async () => {
    // 15:00Z on Sun Nov 8: still Nov 8 in New York (the owner default), already Nov 9 in Auckland.
    clockOverride = new Date('2026-11-08T15:00:00.000Z');
    const users = database.collection('users');
    try {
      await users.updateOne(
        { email: DEMO_STUDENT_USER_EMMA.email },
        { $set: { timezone: 'Pacific/Auckland' } }
      );
      const auckland = parseWeekView((await getWeek(emmaToken)).body);
      expect(auckland.days[0]?.date).toBe('2026-11-09');

      await users.updateOne({ email: DEMO_STUDENT_USER_EMMA.email }, { $unset: { timezone: '' } });
      const ownerZone = parseWeekView((await getWeek(emmaToken)).body);
      expect(ownerZone.days[0]?.date).toBe(calendarDayKey(clockOverride, await ownerTimeZone()));
    } finally {
      clockOverride = undefined;
      await users.updateOne({ email: DEMO_STUDENT_USER_EMMA.email }, { $unset: { timezone: '' } });
    }
  });

  it('uses one clock per request: a task due just after local midnight lands on Tomorrow, never on Today', async () => {
    const timeZone = await ownerTimeZone();
    const todayAt2300 = atLocalHourOnCalendarDay(new Date(), timeZone, 23);
    const almostMidnight = new Date(todayAt2300.getTime() + 59 * 60 * 1000 + 30 * 1000);
    clockOverride = almostMidnight;
    try {
      await insertEmmaAssignment(MIDNIGHT_ID, {
        status: 'not_started',
        dueAt: new Date(almostMidnight.getTime() + 60 * 1000).toISOString(),
      });
      const view = parseWeekView((await getWeek(emmaToken)).body);
      expect(view.days[0]?.date).toBe(calendarDayKey(almostMidnight, timeZone));
      expect(view.days[0]?.items.map((i) => i.assignmentExternalId)).not.toContain(MIDNIGHT_ID);
      expect(view.days[1]?.label).toBe('Tomorrow');
      expect(view.days[1]?.items.map((i) => i.assignmentExternalId)).toContain(MIDNIGHT_ID);
      expect(view.owed.map((i) => i.assignmentExternalId)).not.toContain(MIDNIGHT_ID);
    } finally {
      clockOverride = undefined;
      await database.collection('slc_assignments').deleteOne({ externalId: MIDNIGHT_ID });
    }
  });

  it('Today is unchanged: still picks the missing Algebra item and ignores upcoming and overdue work', async () => {
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseTodayView(res.body);
    expect(view.next?.assignmentExternalId).toBe(MISSING_ALG2_1);
    const json = JSON.stringify(view);
    expect(json).not.toContain(UPCOMING_ID);
    expect(json).not.toContain(OVERDUE_ID);
  });

  it('Liam’s week is Liam’s only (same owner partition)', async () => {
    const view = parseWeekView((await getWeek(liamToken)).body);
    const ids = JSON.stringify(view);
    expect(view.owed.map((i) => i.assignmentExternalId)).toContain(LIAM_MISSING_REPORT);
    expect(ids).not.toContain('demo-emma-');
    expect(ids).not.toContain('week-test-');
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
