/**
 * The parent's Nudge button as the server wires it.
 *
 * The nudge route has its own tests, and those build the students router by hand and give it
 * a sender. Nothing checked what `createApp` gives it. It gave it none: the route recorded
 * "nudged", the board showed "Nudged 2h ago", and nothing was sent to the student.
 */

import { once } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { NotificationChannel, type INotificationPayload } from '@scholaracle/contracts';

jest.mock('@sendgrid/mail', () => {
  const mockSend = jest
    .fn()
    .mockResolvedValue([{ statusCode: 202, body: { message_id: 'email-123' } }]);
  return {
    __esModule: true,
    default: { setApiKey: jest.fn(), send: mockSend },
  };
});

jest.mock('firebase-admin', () => ({
  __esModule: true,
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('fcm-message-id') })),
  initializeApp: jest.fn(),
}));

import { createApp } from '../../server';

const WEB = 'https://nudge-wiring.example';
const APP_CONFIG = {
  jwtSecret: 'nudge-wiring-secret-do-not-use-in-prod',
  baseUrl: WEB,
  sendGridApiKey: 'SG.test-key',
  sendGridFromEmail: 'test@example.com',
  sendGridFromName: 'Test',
};

const PARENT_EMAIL = 'nudge-wiring-parent@example.com';
const PARENT_PASSWORD = 'NudgeWiring!Passw0rd';
const STUDENT_EMAIL = 'nudge-wiring-student@logins.example';
const STUDENT_EXTERNAL_ID = 'nudge-wiring-student';
const ASSIGNMENT = 'nudge-wiring-cell-division';
/** A second child of the same parent, for whom no student login was ever created. */
const NO_LOGIN_EXTERNAL_ID = 'nudge-wiring-no-login';
const NO_LOGIN_ASSIGNMENT = 'nudge-wiring-fractions';

interface IDeliverJob {
  readonly type: string;
  readonly name: string;
  readonly maxAttempts: number;
  readonly data: {
    readonly channel: NotificationChannel;
    readonly notificationPayload: INotificationPayload;
  };
}

describe("The parent's Nudge button as the server wires it", () => {
  jest.setTimeout(60_000);

  let mongoClient: MongoClient;
  let database: Db;
  let server: Server;
  let parentToken: string;
  let parentId: string;
  const studentId = new ObjectId();
  const studentUserId = new ObjectId();
  const noLoginStudentId = new ObjectId();

  const removeTestData = async (): Promise<void> => {
    const users = await database
      .collection('users')
      .find({ email: { $in: [PARENT_EMAIL, STUDENT_EMAIL] } })
      .toArray();
    const userIds = users.map((u) => u._id.toString());
    await database.collection('sessions').deleteMany({ userId: { $in: userIds } });
    await database
      .collection('users')
      .deleteMany({ email: { $in: [PARENT_EMAIL, STUDENT_EMAIL] } });
    await database
      .collection('students')
      .deleteMany({ studentId: { $in: [STUDENT_EXTERNAL_ID, NO_LOGIN_EXTERNAL_ID] } });
    await database
      .collection('slc_assignments')
      .deleteMany({ externalId: { $in: [ASSIGNMENT, NO_LOGIN_ASSIGNMENT] } });
    await database.collection('jobs').deleteMany({
      'data.notificationPayload.triggerData.assignmentExternalId': {
        $in: [ASSIGNMENT, NO_LOGIN_ASSIGNMENT],
      },
    });
  };

  const queuedFor = async (assignment: string = ASSIGNMENT): Promise<IDeliverJob[]> =>
    (await database
      .collection('jobs')
      .find({ 'data.notificationPayload.triggerData.assignmentExternalId': assignment })
      .toArray()) as unknown as IDeliverJob[];

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await removeTestData();

    // 127.0.0.1 on purpose: see adminServerWiring.test.ts for why supertest gets a server.
    server = createApp(APP_CONFIG, database).listen(0, '127.0.0.1');
    await once(server, 'listening');

    const registered = await request(server)
      .post('/api/auth/register')
      .send({ email: PARENT_EMAIL, password: PARENT_PASSWORD, name: 'Nudge Wiring Parent' });
    expect({ status: registered.status, error: registered.body.error }).toEqual({ status: 201 });
    parentToken = registered.body.token as string;
    parentId = registered.body.user.id as string;

    const now = new Date();
    await database.collection('students').insertOne({
      _id: studentId,
      userId: parentId,
      name: 'Emma Wiring',
      studentId: STUDENT_EXTERNAL_ID,
      dataSources: [],
      studentLogin: { userId: studentUserId.toString(), showGrades: false, createdAt: now },
      createdAt: now,
      updatedAt: now,
    });
    await database.collection('users').insertOne({
      _id: studentUserId,
      email: STUDENT_EMAIL,
      name: 'Emma Wiring',
      role: 'student',
      studentId: studentId.toString(),
      devices: [
        {
          deviceId: 'emma-phone',
          type: 'ios',
          pushToken: 'ExponentPushToken[nudge-wiring]',
          lastActive: now,
          audience: 'student',
        },
      ],
    });
    await database.collection('slc_assignments').insertOne({
      userId: parentId,
      studentExternalId: STUDENT_EXTERNAL_ID,
      externalId: ASSIGNMENT,
      deletedAt: null,
      record: { title: 'Cell Division', status: 'missing' },
    });

    await database.collection('students').insertOne({
      _id: noLoginStudentId,
      userId: parentId,
      name: 'Liam Wiring',
      studentId: NO_LOGIN_EXTERNAL_ID,
      dataSources: [],
      createdAt: now,
      updatedAt: now,
    });
    await database.collection('slc_assignments').insertOne({
      userId: parentId,
      studentExternalId: NO_LOGIN_EXTERNAL_ID,
      externalId: NO_LOGIN_ASSIGNMENT,
      deletedAt: null,
      record: { title: 'Fractions', status: 'missing' },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await removeTestData();
    await mongoClient.close();
  });

  it("queues the nudge for the student's phone and their login email", async () => {
    expect(await queuedFor()).toEqual([]);

    const res = await request(server)
      .post(`/api/students/${studentId.toString()}/assignments/${ASSIGNMENT}/nudge`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect({ status: res.status, error: res.body.error }).toEqual({ status: 200 });
    expect(res.body.lastNudgedAt).toEqual(expect.any(String));

    const jobs = await queuedFor();
    expect(jobs.map((j) => j.data.channel).sort()).toEqual([
      NotificationChannel.EMAIL,
      NotificationChannel.PUSH,
    ]);
    for (const job of jobs) {
      // The workers process picks up `deliver` jobs and sends them.
      expect({ type: job.type, name: job.name, maxAttempts: job.maxAttempts }).toEqual({
        type: 'deliver',
        name: 'deliver-one',
        maxAttempts: 5,
      });
    }

    const push = jobs.find((j) => j.data.channel === NotificationChannel.PUSH);
    expect(push?.data.notificationPayload).toMatchObject({
      userId: studentUserId.toString(),
      studentId: studentId.toString(),
      body: expect.stringContaining('Cell Division'),
    });

    const email = jobs.find((j) => j.data.channel === NotificationChannel.EMAIL);
    expect(email?.data.notificationPayload.userId).toBe(STUDENT_EMAIL);
    expect(email?.data.notificationPayload.body).toContain(
      `${WEB}/studio/assignments/${ASSIGNMENT}`
    );
  });

  it('sends nothing more for a second press the same day', async () => {
    const before = (await queuedFor()).length;

    const res = await request(server)
      .post(`/api/students/${studentId.toString()}/assignments/${ASSIGNMENT}/nudge`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(429);
    expect(await queuedFor()).toHaveLength(before);
  });

  describe('for a student who has no login', () => {
    const nudge = (): request.Test =>
      request(server)
        .post(
          `/api/students/${noLoginStudentId.toString()}/assignments/${NO_LOGIN_ASSIGNMENT}/nudge`
        )
        .set('Authorization', `Bearer ${parentToken}`);

    it('refuses, tells the parent what to do, and queues nothing', async () => {
      const res = await nudge();

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        'Liam has no student login to send a nudge to. Create one under Settings, Student logins.'
      );
      expect(await queuedFor(NO_LOGIN_ASSIGNMENT)).toEqual([]);
    });

    it('does not mark the assignment as nudged', async () => {
      const doc = await database
        .collection('slc_assignments')
        .findOne({ externalId: NO_LOGIN_ASSIGNMENT });
      expect(doc?.['lastNudgedAt']).toBeUndefined();

      // Asking again gets the same answer, not "already nudged today".
      expect((await nudge()).status).toBe(409);
    });
  });
});
