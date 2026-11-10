/**
 * Cross-tenant IDOR sweep: unrelated parent cannot access another household's
 * student-scoped resources (403/404 only). Excludes /api/admin/** and non-tenant routes.
 */

import request from 'supertest';
import type { Test } from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import {
  AlertRepository,
  CommunicationLogRepository,
  IngestSourceRepository,
  PortalAccountRepository,
  SessionRepository,
  StudentRepository,
} from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';
import { AssetRepository } from '../services/assets/AssetRepository';
import {
  SOURCE_ID_ON_STUDENT,
  buildSweepRows,
  sweepTemplateKeys,
  type ISweepIds,
} from './parentByIdRouteIdor.sweep.cases';
import { listParentParamRoutes } from './parentByIdRouteIdor.routeDiscovery';

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

import { createApp } from '../server';

const EMAIL_A = 'parent-a@idor-sweep.test';
const EMAIL_B = 'parent-b@idor-sweep.test';
const JWT_SECRET = 'idor-sweep-jwt-secret-do-not-use-in-prod';
const INTEGRATION_SOURCE_ID = 'idor-sweep-integration-src';
const INVITE_GROUP_ID = '00000000-0000-4000-8000-idorsweep0001';
const SOURCE_RUN_ID = 'idor-sweep-run-1';

describe('Parent API — by-id route IDOR sweep', () => {
  let mongoClient: MongoClient;
  let database: Db;
  let app: ReturnType<typeof createApp>;
  let tokenB: string;
  let ids: ISweepIds;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    app = createApp(
      {
        jwtSecret: JWT_SECRET,
        sendGridApiKey: 'SG.test-key',
        sendGridFromEmail: 'test@example.com',
        sendGridFromName: 'Test',
      },
      database
    );
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({ email: { $in: [EMAIL_A, EMAIL_B] } });
    await database.collection('slc_portal_accounts').deleteMany({ displayName: 'Sweep Portal' });
    await database.collection('students').deleteMany({ name: { $in: ['IDOR Sweep Child'] } });
    await database.collection('subscriptions').deleteMany({});
    await database.collection('alerts').deleteMany({ message: 'idor-sweep' });
    await database
      .collection('slc_sources')
      .deleteMany({ sourceId: { $in: [SOURCE_ID_ON_STUDENT, INTEGRATION_SOURCE_ID] } });
    await database.collection('slc_runs').deleteMany({ runId: SOURCE_RUN_ID });
    await database.collection('slc_courses').deleteMany({ externalId: 'idor-sweep-course' });
    await database.collection('slc_assignments').deleteMany({ externalId: 'idor-sweep-asg' });
    await database.collection('slc_assignment_comments').deleteMany({
      assignmentExternalId: 'idor-sweep-asg',
    });
    await database.collection('slc_assets').deleteMany({ assetId: 'idor-sweep-asset-1' });
    await database.collection('communication_logs').deleteMany({ content: 'idor-sweep' });
    await database.collection('sessions').deleteMany({ ipAddress: 'idor-sweep' });
    await database.collection('refresh_tokens').deleteMany({});
    await database.collection('shared_parent_transfer_confirmations').deleteMany({});

    const authService = new AuthService(database, JWT_SECRET);
    const regA = await authService.register(EMAIL_A, 'password123', 'Parent A');
    const regB = await authService.register(EMAIL_B, 'password123', 'Parent B');
    if (
      !regA.success ||
      !regA.user?.id ||
      !regA.token ||
      !regB.success ||
      !regB.user?.id ||
      !regB.token
    ) {
      throw new Error('Failed to register sweep users');
    }
    tokenB = regB.token;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    for (const userId of [regA.user.id, regB.user.id]) {
      await database.collection('subscriptions').insertOne({
        userId,
        plan: 'family',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        billingCycle: 'monthly',
        createdAt: now,
        updatedAt: now,
        events: [{ type: 'created', toPlan: 'family', timestamp: now }],
      });
    }

    const studentRepo = new StudentRepository(database);
    const createdStudent = await studentRepo.create({
      userId: regA.user.id,
      name: 'IDOR Sweep Child',
      grade: 9,
      studentId: 'idor-sweep-external-stu',
      dataSources: [
        {
          id: SOURCE_ID_ON_STUDENT,
          pluginId: 'custom-district-api::default',
          enabled: true,
          schedule: 'every_6h',
          dataTypes: ['grades'],
          status: 'active',
        },
      ],
    });
    const studentId = createdStudent._id!.toString();
    await studentRepo.update(studentId, {
      sharedWith: [
        {
          email: 'pending@idor-sweep.test',
          role: 'parent',
          status: 'pending',
          invitedAt: now,
          inviteGroupId: INVITE_GROUP_ID,
          invitedByUserId: regA.user.id,
        },
      ],
    });

    const portalRepo = new PortalAccountRepository(database);
    const portal = await portalRepo.upsertByHost({
      userId: regA.user.id,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      portalBaseUrl: 'https://school.example.com',
      institutionExternalId: 'idor-sweep-inst',
      displayName: 'Sweep Portal',
    });

    const ingestRepo = new IngestSourceRepository(database);
    await ingestRepo.upsert({
      userId: regA.user.id,
      sourceId: SOURCE_ID_ON_STUDENT,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      displayName: 'Sweep DS',
      portalBaseUrl: 'https://school.example.com',
      schedule: 'every_6h',
      dataTypes: ['grades'],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await ingestRepo.upsert({
      userId: regA.user.id,
      sourceId: INTEGRATION_SOURCE_ID,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      displayName: 'Sweep Integration',
      portalBaseUrl: 'https://school.example.com',
      schedule: 'every_6h',
      dataTypes: ['grades'],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await database.collection('slc_runs').insertOne({
      userId: regA.user.id,
      sourceId: SOURCE_ID_ON_STUDENT,
      runId: SOURCE_RUN_ID,
      status: 'committed',
      startedAt: now,
      uploadedAt: now,
      committedAt: now,
      error: null,
      attempts: 1,
    });

    const mergedCourseId = 'abc123def456';

    await database.collection('slc_courses').insertOne({
      userId: regA.user.id,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      externalId: 'idor-sweep-course',
      deletedAt: null,
      record: { name: 'Algebra' },
    });

    const commentInsert = await database.collection('slc_assignment_comments').insertOne({
      userId: regA.user.id,
      authorUserId: regA.user.id,
      assignmentExternalId: 'idor-sweep-asg',
      courseExternalId: 'idor-sweep-course',
      studentExternalId: 'idor-sweep-external-stu',
      authorEmail: EMAIL_A,
      authorName: 'A',
      authorRole: 'owner',
      body: 'idor-sweep comment',
      createdAt: now,
      updatedAt: now,
    });

    await database.collection('slc_assignments').insertOne({
      userId: regA.user.id,
      studentId,
      courseExternalId: 'idor-sweep-course',
      externalId: 'idor-sweep-asg',
      deletedAt: null,
      record: { title: 'Sweep HW', status: 'missing', dueAt: now.toISOString() },
    });

    const alertRepo = new AlertRepository(database);
    const alert = await alertRepo.create({
      studentId,
      userId: regA.user.id,
      type: AlertType.GRADE_DROP,
      severity: 'high',
      message: 'idor-sweep',
      relatedData: {},
    });

    const commRepo = new CommunicationLogRepository(database);
    const comm = await commRepo.create({
      userId: regA.user.id,
      channel: 'email',
      type: 'notification',
      subject: 'Sweep',
      content: 'idor-sweep',
      status: 'sent',
      triggeredBy: 'user_action',
      relatedEntityType: 'student',
      relatedEntityId: studentId,
    });

    const sessionRepo = new SessionRepository(database);
    const sess = await sessionRepo.create({
      userId: regA.user.id,
      userType: 'user',
      refreshTokenFamilyId: 'fam-idor-sweep-a',
      deviceInfo: {},
      ipAddress: 'idor-sweep',
      lastActiveAt: now,
    });

    const assetRepo = new AssetRepository(database);
    await assetRepo.insert({
      assetId: 'idor-sweep-asset-1',
      sourceId: SOURCE_ID_ON_STUDENT,
      userId: regA.user.id,
      originalUrl: 'https://example.com/f',
      storageKey: `${SOURCE_ID_ON_STUDENT}/idor-sweep-asset-1`,
      fileName: 'f',
      mimeType: 'application/pdf',
      fileSize: 1,
      contentHash: 'hash1',
      entityType: 'assignment',
      entityExternalId: 'idor-sweep-asg',
    });

    const contactToken = 'a'.repeat(64);

    ids = {
      studentId,
      alertId: alert.id ?? '',
      integrationId: INTEGRATION_SOURCE_ID,
      emailLogId: comm._id!.toString(),
      sessionIdA: sess._id.toString(),
      assetId: 'idor-sweep-asset-1',
      commentId: commentInsert.insertedId.toString(),
      mergedCourseId,
      contactToken,
      parentEmailEncoded: encodeURIComponent('contact@idor-sweep.test'),
      inviteGroupId: INVITE_GROUP_ID,
      portalAccountId: portal.portalAccountId,
      sourceRunId: SOURCE_RUN_ID,
    };
  });

  it('lists every checked route and returns 403 or 404 for unrelated parent', async () => {
    const rows = buildSweepRows(ids);
    const checklist: string[] = rows.map((r) => `${r.method.toUpperCase()} ${r.path}`);

    // eslint-disable-next-line no-console
    console.info(`IDOR sweep: ${checklist.length} routes`);
    for (const line of checklist) {
      // eslint-disable-next-line no-console
      console.info(`  ${line}`);
    }

    for (const row of rows) {
      let req: Test;
      switch (row.method) {
        case 'get':
          req = request(app).get(row.path);
          break;
        case 'head':
          req = request(app).head(row.path);
          break;
        case 'post':
          req = request(app).post(row.path);
          break;
        case 'put':
          req = request(app).put(row.path);
          break;
        case 'patch':
          req = request(app).patch(row.path);
          break;
        case 'delete':
          req = request(app).delete(row.path);
          break;
        default: {
          const exhaustive: never = row.method;
          throw new Error(`Unhandled method ${String(exhaustive)}`);
        }
      }
      req.set('Authorization', `Bearer ${tokenB}`);
      if (row.body !== undefined) {
        req.send(row.body);
      }
      const res = await req;
      expect([403, 404]).toContain(res.status);
    }
  });

  it('covers every parent JWT route with a :param in the sweep table', () => {
    const tableKeys = sweepTemplateKeys(buildSweepRows(ids));
    const discovered = listParentParamRoutes(app).map((r) => `${r.method} ${r.path}`);
    const missing = discovered.filter((key) => !tableKeys.has(key));
    expect(missing).toEqual([]);
  });
});
