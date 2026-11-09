/**
 * Student review R3 — "Need help" that goes somewhere (docs/student-review-spec.md §3.2).
 *
 * A student's need_help tap stores the note on the assignment, creates one
 * student_needs_help alert and enqueues one notify job (the same job ingest alerts take);
 * a second tap within 24 h sends nothing; moving the status on clears the note; the parent
 * board shows the item under Needs attention with "Asked for help".
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { AlertType, type IActionBoardResponse } from '@scholaracle/contracts';
import { seedRouter } from '../seed/seed';
import { studentsRouter } from '../students/students';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA } from '../seed/demo-data';
import { API_TEST_SEED_TOKEN } from '../seed/seed-test-token';
import { studioRouter } from './studio';
import {
  HELP_REQUEST_WINDOW_MS,
  STUDENT_HELP_REQUESTS_COLLECTION,
  type IAlertJobQueue,
} from './studentHelpRequests';

const DUE_SOON_ID = 'r3-emma-due-soon';
const WEB_ORIGIN = 'http://web.test.example';
const HOUR_MS = 60 * 60 * 1000;

type QueueCall = [string, string, Record<string, unknown>, { maxAttempts?: number } | undefined];

describe('PATCH /api/studio/assignments/:externalId/status — need_help (R3)', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let emmaToken: string;
  let parentToken: string;
  let emmaMongoId: string;
  let parentUserId: string;
  let savedSeedToken: string | undefined;

  const queue: IAlertJobQueue & { calls: QueueCall[] } = {
    calls: [],
    async add(type, name, data, options) {
      this.calls.push([type, name, data, options]);
      return `job-${this.calls.length}`;
    },
  };

  function patchStatus(token: string, externalId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/studio/assignments/${externalId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function assignmentDoc(externalId: string) {
    return database.collection('slc_assignments').findOne({ externalId });
  }

  function helpAlerts() {
    return database.collection('alerts').find({ type: AlertType.STUDENT_NEEDS_HELP }).toArray();
  }

  beforeAll(async () => {
    savedSeedToken = process.env['SEED_TOKEN'];
    process.env['SEED_TOKEN'] = API_TEST_SEED_TOKEN;
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-r3-need-help');
    const authService = new AuthService(database);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example', jwtSecret: 'test-secret' })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({
        database,
        baseUrl: WEB_ORIGIN,
        jwtSecret: 'test-secret',
        alertQueue: queue,
      })
    );
    app.use(createErrorHandler());

    const seeded = await request(app)
      .post('/api/seed/demo')
      .set('X-Seed-Token', API_TEST_SEED_TOKEN);
    expect(seeded.status).toBe(200);

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined || parent.user === undefined) {
      throw new Error('Parent login failed');
    }
    parentToken = parent.token;
    parentUserId = parent.user.id;

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined || emma.user?.studentId === undefined) {
      throw new Error('Emma student login failed');
    }
    emmaToken = emma.token;
    emmaMongoId = emma.user.studentId;

    // Due in 24 h and otherwise unremarkable: without the ask it belongs in due_soon.
    await database.collection('slc_assignments').insertOne({
      userId: parentUserId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: DUE_SOON_ID,
      studentExternalId: 'demo-emma',
      studentId: emmaMongoId,
      courseExternalId: 'demo-emma-ap-bio',
      deletedAt: null,
      observedAt: new Date(),
      updatedAt: new Date(),
      record: {
        title: 'Ch. 5 problems',
        status: 'not_started',
        dueAt: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
      },
    });
  });

  beforeEach(async () => {
    queue.calls = [];
    await database.collection(STUDENT_HELP_REQUESTS_COLLECTION).deleteMany({});
    await database.collection('alerts').deleteMany({ type: AlertType.STUDENT_NEEDS_HELP });
    await database.collection('slc_assignments').updateOne(
      { externalId: DUE_SOON_ID },
      {
        $set: { studentStatus: null },
        $unset: { studentNote: '', studentNoteAt: '', studentHelpRequestedAt: '' },
      }
    );
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
    if (savedSeedToken === undefined) delete process.env['SEED_TOKEN'];
    else process.env['SEED_TOKEN'] = savedSeedToken;
  });

  it('stores the trimmed note, creates one alert and enqueues one notify job for the adults', async () => {
    const before = Date.now();
    const res = await patchStatus(emmaToken, DUE_SOON_ID, {
      status: 'need_help',
      note: "  I don't get #7  ",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      studentStatus: 'need_help',
      studentNote: "I don't get #7",
      notified: true,
    });

    const stored = await assignmentDoc(DUE_SOON_ID);
    expect(stored?.['studentStatus']).toBe('need_help');
    expect(stored?.['studentNote']).toBe("I don't get #7");
    expect(stored?.['studentNoteAt']).toBeInstanceOf(Date);
    expect(stored?.['studentHelpRequestedAt']).toBeInstanceOf(Date);
    expect((stored?.['studentHelpRequestedAt'] as Date).getTime()).toBeGreaterThanOrEqual(
      before - 1000
    );

    const alerts = await helpAlerts();
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert['userId']).toBe(parentUserId);
    expect(alert['studentId']).toBe(emmaMongoId);
    expect(alert['severity']).toBe('info');
    expect(alert['message']).toBe('Emma asked for help with Ch. 5 problems');
    const relatedData = alert['relatedData'] as Record<string, unknown>;
    expect(relatedData).toEqual(
      expect.objectContaining({
        assignmentExternalId: DUE_SOON_ID,
        courseExternalId: 'demo-emma-ap-bio',
        title: 'Ch. 5 problems',
        note: "I don't get #7",
        studentName: 'Emma Mitchell',
        dashboardUrl: `${WEB_ORIGIN}/dashboard/students/${emmaMongoId}?board=needs_attention#action-board`,
      })
    );
    expect(relatedData['courseName']).toMatch(/Bio/);
    expect(typeof relatedData['dueAt']).toBe('string');

    expect(queue.calls).toHaveLength(1);
    const [type, name, data, options] = queue.calls[0]!;
    expect(type).toBe('notify');
    expect(name).toBe('deliver-notification');
    expect(options).toEqual({ maxAttempts: 5 });
    expect(data).toEqual({
      alert: {
        studentId: emmaMongoId,
        type: AlertType.STUDENT_NEEDS_HELP,
        severity: 'info',
        relatedData,
        userId: parentUserId,
      },
    });
  });

  it('a second tap within 24 h is rate-limited: notified false with nextAllowedAt, nothing new enqueued', async () => {
    const first = await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: 'one' });
    expect(first.body.notified).toBe(true);
    const firstAsk = (await assignmentDoc(DUE_SOON_ID))?.['studentHelpRequestedAt'] as Date;

    const second = await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: 'two' });
    expect(second.status).toBe(200);
    expect(second.body.notified).toBe(false);
    expect(second.body.studentNote).toBe('two');
    const nextAllowedAt = new Date(second.body.nextAllowedAt as string).getTime();
    expect(Math.abs(nextAllowedAt - (Date.now() + HELP_REQUEST_WINDOW_MS))).toBeLessThan(10_000);

    expect(queue.calls).toHaveLength(1);
    expect(await helpAlerts()).toHaveLength(1);
    const stored = await assignmentDoc(DUE_SOON_ID);
    expect(stored?.['studentNote']).toBe('two');
    expect((stored?.['studentHelpRequestedAt'] as Date).getTime()).toBe(firstAsk.getTime());
  });

  it('after the 24 h window the adults are told again', async () => {
    await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help' });
    await database
      .collection(STUDENT_HELP_REQUESTS_COLLECTION)
      .updateOne(
        { studentId: emmaMongoId, assignmentExternalId: DUE_SOON_ID },
        { $set: { lastSentAt: new Date(Date.now() - 25 * HOUR_MS) } }
      );
    const res = await patchStatus(emmaToken, DUE_SOON_ID, {
      status: 'need_help',
      note: 'still stuck',
    });
    expect(res.body.notified).toBe(true);
    expect(res.body.nextAllowedAt).toBeUndefined();
    expect(queue.calls).toHaveLength(2);
    expect(await helpAlerts()).toHaveLength(2);
  });

  it('rejects a note over 140 characters or not a string; accepts exactly 140', async () => {
    const tooLong = await patchStatus(emmaToken, DUE_SOON_ID, {
      status: 'need_help',
      note: 'x'.repeat(141),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.code).toBe('VALIDATION_ERROR');

    const notText = await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: 7 });
    expect(notText.status).toBe(400);
    expect(queue.calls).toHaveLength(0);
    expect(await helpAlerts()).toHaveLength(0);

    const exact = await patchStatus(emmaToken, DUE_SOON_ID, {
      status: 'need_help',
      note: 'y'.repeat(140),
    });
    expect(exact.status).toBe(200);
    expect(exact.body.studentNote).toHaveLength(140);
  });

  it('treats a blank note as no note and still tells the adults', async () => {
    const res = await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: '   ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, studentStatus: 'need_help', notified: true });
    const stored = await assignmentDoc(DUE_SOON_ID);
    expect(stored?.['studentNote']).toBeUndefined();
    expect(stored?.['studentHelpRequestedAt']).toBeInstanceOf(Date);
    const relatedData = (await helpAlerts())[0]?.['relatedData'] as Record<string, unknown>;
    expect(relatedData['note']).toBeUndefined();
  });

  it('moving the status on clears the note and the ask without notifying anyone', async () => {
    await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: 'help' });
    const res = await patchStatus(emmaToken, DUE_SOON_ID, { status: 'working_on_it' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, studentStatus: 'working_on_it' });
    const stored = await assignmentDoc(DUE_SOON_ID);
    expect(stored?.['studentStatus']).toBe('working_on_it');
    expect(stored?.['studentNote']).toBeUndefined();
    expect(stored?.['studentNoteAt']).toBeUndefined();
    expect(stored?.['studentHelpRequestedAt']).toBeUndefined();
    expect(queue.calls).toHaveLength(1);
  });

  it('404s an unknown assignment and enqueues nothing', async () => {
    const res = await patchStatus(emmaToken, 'no-such-assignment', { status: 'need_help' });
    expect(res.status).toBe(404);
    expect(queue.calls).toHaveLength(0);
    expect(await helpAlerts()).toHaveLength(0);
  });

  it('the parent board lists the ask under Needs attention with askedForHelpAt and the note, even though it is only due soon', async () => {
    const boardBefore = await request(app)
      .get(`/api/students/${emmaMongoId}/action-board`)
      .set('Authorization', `Bearer ${parentToken}`);
    expect(boardBefore.status).toBe(200);
    const bucketOf = (board: IActionBoardResponse, id: string) =>
      board.buckets.find((b) => b.items.some((i) => i.assignmentExternalId === id))?.id;
    expect(bucketOf(boardBefore.body as IActionBoardResponse, DUE_SOON_ID)).toBe('due_soon');

    await patchStatus(emmaToken, DUE_SOON_ID, { status: 'need_help', note: "I don't get #7" });
    const boardAfter = await request(app)
      .get(`/api/students/${emmaMongoId}/action-board`)
      .set('Authorization', `Bearer ${parentToken}`);
    const board = boardAfter.body as IActionBoardResponse;
    expect(bucketOf(board, DUE_SOON_ID)).toBe('needs_attention');
    const item = board.buckets
      .flatMap((b) => b.items)
      .find((i) => i.assignmentExternalId === DUE_SOON_ID);
    expect(item?.studentStatus).toBe('need_help');
    expect(item?.studentNote).toBe("I don't get #7");
    expect(typeof item?.askedForHelpAt).toBe('string');
    expect(Date.now() - new Date(item!.askedForHelpAt!).getTime()).toBeLessThan(60_000);

    await patchStatus(emmaToken, DUE_SOON_ID, { status: 'done' });
    const boardDone = await request(app)
      .get(`/api/students/${emmaMongoId}/action-board`)
      .set('Authorization', `Bearer ${parentToken}`);
    const doneItem = (boardDone.body as IActionBoardResponse).buckets
      .flatMap((b) => b.items)
      .find((i) => i.assignmentExternalId === DUE_SOON_ID);
    expect(doneItem?.askedForHelpAt).toBeUndefined();
    expect(doneItem?.studentNote).toBeUndefined();
    expect(bucketOf(boardDone.body as IActionBoardResponse, DUE_SOON_ID)).toBe('due_soon');
  });
});
