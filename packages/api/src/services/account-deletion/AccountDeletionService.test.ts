import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db, type Document } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
  UserRepository,
} from '@scholaracle/database';
import { connectorAuthMiddleware } from '../../middleware/connectorAuth';
import { seedActiveConnectorJti } from '../../testHelpers/connectorDeviceTestSeed';
import type { IAssetStore } from '../assets/IAssetStore';
import { LocalAssetStore } from '../assets/LocalAssetStore';
import { AccountDeletionService } from './AccountDeletionService';

const PASSWORD = 'HouseholdDel123!';

interface IHousehold {
  readonly userId: string;
  readonly studentId: string;
}

interface ISeedRow {
  readonly collection: string;
  readonly row: Document;
}

/**
 * One row per collection, shaped the way the product writes it: synced school records under
 * the owner's user id as a string, the reminder log under the student's id as a string, the
 * stale-sync record with the owner's id as its `_id`.
 */
function householdRows(household: IHousehold): readonly ISeedRow[] {
  const { userId, studentId } = household;
  const now = new Date();
  const dueAt = new Date('2026-12-04T05:59:00.000Z');
  return [
    {
      collection: 'slc_student_profiles',
      row: { userId, externalId: 'profile-1', record: { name: 'Seed Student', grade: '9' } },
    },
    {
      collection: 'slc_messages',
      row: { userId, externalId: 'message-1', record: { subject: 'About the lab report' } },
    },
    {
      collection: 'slc_teachers',
      row: { userId, externalId: 'teacher-1', record: { name: 'Ms. Rivera' } },
    },
    {
      collection: 'slc_institutions',
      row: { userId, externalId: 'school-1', record: { name: 'Lincoln High' } },
    },
    { collection: 'slc_event_overrides', row: { userId, externalId: 'override-1', record: {} } },
    { collection: 'slc_assignment_reconciliation', row: { userId, matches: [], updatedAt: now } },
    {
      collection: 'slc_pending_student_reconciliation',
      row: { userId, sourceId: 'source-1', studentExternalId: 'ext-2', displayName: 'Sam' },
    },
    {
      collection: 'slc_run_skeletons',
      row: { userId, runId: 'run-1', step: 'grades', storageKey: `skeletons/${userId}/run-1/a` },
    },
    {
      collection: 'slc_run_skeletons',
      row: { userId: new ObjectId(userId), runId: 'run-2', step: 'grades', storageKey: 'b' },
    },
    {
      collection: 'scraper_assist_usage',
      row: { _id: `${userId}:2026-11-27`, userId, day: '2026-11-27', count: 3 },
    },
    { collection: 'scraper_generation_jobs', row: { userId, status: 'completed' } },
    {
      collection: 'sync_staleness_alerts',
      row: { _id: userId, sourceKeys: ['source-1'], alertedAt: now },
    },
    {
      collection: 'guidance_sends',
      row: {
        _id: `${studentId}:hw-1:${dueAt.toISOString()}:t12h:parent`,
        studentId,
        assignmentExternalId: 'hw-1',
        dueAt,
        step: 't12h',
        audience: 'parent',
        sentAt: now,
      },
    },
    {
      collection: 'guidance_student_days',
      row: { _id: `${studentId}:2026-11-27`, studentId, dayKey: '2026-11-27', count: 1 },
    },
    {
      collection: EXTRA_USER_SCOPED_JOB_FILTER,
      row: {
        type: 'guidance',
        name: 't72h',
        status: 'pending',
        scheduledFor: now,
        data: {
          studentId,
          assignmentExternalId: 'hw-1',
          title: 'Cell Division',
          dueAt: dueAt.toISOString(),
          timezone: 'America/Chicago',
          step: 't72h',
        },
      },
    },
    {
      collection: 'student_login_audit',
      row: { studentId, actorUserId: userId, action: 'provision', at: now },
    },
    {
      collection: 'shared_parent_transfer_confirmations',
      row: { studentId, email: 'co-parent@test.com', type: 'new', confirmedAt: now },
    },
    // Written by older versions of the server; nothing writes them now.
    { collection: 'grades', row: { studentId, courseId: 'course-1', scrapedAt: now } },
    { collection: 'assignments', row: { studentId, dueDate: now, scrapedAt: now } },
  ];
}

/** Seeds the rows, each tagged with the household it belongs to. */
async function seedRows(db: Db, household: IHousehold): Promise<readonly string[]> {
  const rows = householdRows(household);
  for (const { collection, row } of rows) {
    await db.collection(collection).insertOne({ ...row, seededFor: household.userId });
  }
  return [...new Set(rows.map((r) => r.collection))];
}

/** How many of a household's seeded rows are still there, per collection. */
async function rowsLeft(
  db: Db,
  household: IHousehold,
  collections: readonly string[]
): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  for (const name of collections) {
    left[name] = await db.collection(name).countDocuments({ seededFor: household.userId });
  }
  return left;
}

function onlyNonZero(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

async function seedHouseholdRow(db: Db, userId: string, studentId: string): Promise<void> {
  const userOid = new ObjectId(userId);
  const studentOid = new ObjectId(studentId);
  const now = new Date();

  for (const target of USER_SCOPED_DELETION_TARGETS) {
    const base =
      target.userIdAsObjectId === true
        ? { userId: userOid, createdAt: now }
        : { userId, createdAt: now };
    await db.collection(target.name).insertOne({ ...base, kind: `seed-${target.name}` });
  }

  await db.collection(EXTRA_USER_SCOPED_JOB_FILTER).insertOne({
    type: 'flush_email_digests',
    status: 'pending',
    createdAt: now,
    data: { userId },
  });

  for (const name of STUDENT_SCOPED_DELETION_COLLECTIONS) {
    await db.collection(name).insertOne({ studentId: studentOid, createdAt: now });
  }

  await db.collection('users').updateOne(
    { _id: userOid },
    {
      $set: {
        devices: [
          {
            deviceId: 'phone-1',
            type: 'ios',
            pushToken: 'ExponentPushToken[test]',
            lastActive: now,
          },
        ],
      },
    }
  );
}

describe('AccountDeletionService', () => {
  jest.setTimeout(120_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('account-deletion-test');
    authService = new AuthService(database, 'test-jwt-secret');
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const names = [
      ...USER_SCOPED_DELETION_TARGETS.map((t) => t.name),
      ...STUDENT_SCOPED_DELETION_COLLECTIONS,
      EXTRA_USER_SCOPED_JOB_FILTER,
      'students',
      'users',
      ACCOUNT_DELETION_AUDIT_COLLECTION,
    ];
    await Promise.all(names.map((n) => database.collection(n).deleteMany({})));
  });

  it('removes every household row, writes audit hash only, and blocks login', async () => {
    const email = 'deletion-household@test.com';
    const reg = await authService.register(email, PASSWORD, 'Delete Me');
    if (!reg.success || !reg.user?.id) {
      throw new Error('register failed');
    }
    const userId = reg.user.id;

    const studentInsert = await database.collection('students').insertOne({
      userId: new ObjectId(userId),
      name: 'Seed Student',
      grade: 9,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const studentId = studentInsert.insertedId.toString();

    const passwordHash = await UserRepository.hashPassword(PASSWORD);
    await new UserRepository(database).create({
      email: 'student-login-deletion@test.com',
      passwordHash,
      name: 'Seed Student',
      role: 'student',
      studentId,
    });

    await seedHouseholdRow(database, userId, studentId);

    const service = new AccountDeletionService(database);
    await service.deleteParentAccount(userId);

    for (const target of USER_SCOPED_DELETION_TARGETS) {
      const filter =
        target.userIdAsObjectId === true
          ? { userId: { $in: [userId, new ObjectId(userId)] } }
          : { userId };
      const count = await database.collection(target.name).countDocuments(filter);
      expect(count).toBe(0);
    }

    const jobCount = await database.collection(EXTRA_USER_SCOPED_JOB_FILTER).countDocuments({
      'data.userId': userId,
    });
    expect(jobCount).toBe(0);

    for (const name of STUDENT_SCOPED_DELETION_COLLECTIONS) {
      const count = await database.collection(name).countDocuments({
        studentId: { $in: [studentId, new ObjectId(studentId)] },
      });
      expect(count).toBe(0);
    }

    expect(
      await database.collection('students').countDocuments({ userId: new ObjectId(userId) })
    ).toBe(0);
    expect(await database.collection('users').countDocuments({ email })).toBe(0);
    expect(await database.collection('users').countDocuments({ studentId })).toBe(0);

    const audits = await database.collection(ACCOUNT_DELETION_AUDIT_COLLECTION).find({}).toArray();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.['userIdHash']).toMatch(/^[a-f0-9]{64}$/);
    expect(audits[0]?.['email']).toBeUndefined();

    const login = await authService.login(email, PASSWORD);
    expect(login.success).toBe(false);
  });

  it("removes a deleted co-parent from another family's student but keeps that student", async () => {
    const reg = await authService.register('co-parent-delete@test.com', PASSWORD, 'Co Parent');
    if (!reg.success || !reg.user?.id) {
      throw new Error('register failed');
    }
    const coParentId = reg.user.id;
    const otherOwner = new ObjectId();
    const shared = await database.collection('students').insertOne({
      userId: otherOwner,
      name: 'Other Family Student',
      grade: 10,
      sharedWith: [
        { userId: coParentId, email: 'co-parent-delete@test.com', role: 'parent' },
        { email: 'keep-me@test.com', role: 'guardian' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await new AccountDeletionService(database).deleteParentAccount(coParentId);

    const student = await database.collection('students').findOne({ _id: shared.insertedId });
    expect(student).not.toBeNull();
    const emails = ((student?.['sharedWith'] ?? []) as Array<{ email: string }>).map(
      (e) => e.email
    );
    expect(emails).toEqual(['keep-me@test.com']);
  });

  async function createHousehold(email: string): Promise<IHousehold> {
    const reg = await authService.register(email, PASSWORD, 'Parent');
    if (!reg.success || !reg.user?.id) {
      throw new Error('register failed');
    }
    const student = await database.collection('students').insertOne({
      userId: new ObjectId(reg.user.id),
      name: 'Seed Student',
      grade: 9,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { userId: reg.user.id, studentId: student.insertedId.toString() };
  }

  describe('everything the household left on the server', () => {
    it('removes the synced school records, the reminder log and the queued reminders', async () => {
      const leaving = await createHousehold('leaving-household@test.com');
      const collections = await seedRows(database, leaving);
      expect(onlyNonZero(await rowsLeft(database, leaving, collections))).not.toEqual({});

      await new AccountDeletionService(database).deleteParentAccount(leaving.userId);

      // Names what stayed behind, so a failure reads as a list of collections.
      expect(onlyNonZero(await rowsLeft(database, leaving, collections))).toEqual({});
    });

    it("leaves another household's rows in those collections alone", async () => {
      const leaving = await createHousehold('leaving-neighbour@test.com');
      const staying = await createHousehold('staying-neighbour@test.com');
      await seedRows(database, leaving);
      const collections = await seedRows(database, staying);
      const before = await rowsLeft(database, staying, collections);

      await new AccountDeletionService(database).deleteParentAccount(leaving.userId);

      expect(await rowsLeft(database, staying, collections)).toEqual(before);
      expect(Object.values(before).every((count) => count > 0)).toBe(true);
      expect(
        await database
          .collection('students')
          .countDocuments({ _id: new ObjectId(staying.studentId) })
      ).toBe(1);
    });
  });

  describe('devices the household connected', () => {
    const tokens = new ConnectorTokenService('test-connector-secret');

    /** What the ingest routes' own check answers for a device's token. */
    function connectorAnswer(token: string): Promise<'allowed' | number> {
      return new Promise((resolve) => {
        const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
        const res = {
          status: (code: number) => ({ json: () => resolve(code) }),
        } as unknown as Response;
        connectorAuthMiddleware(tokens, { database })(req, res, () => resolve('allowed'));
      });
    }

    it('are refused once the account is deleted, so a sync cannot bring the records back', async () => {
      const household = await createHousehold('connected-device@test.com');
      await seedActiveConnectorJti(database, household.userId, 'laptop-1', 'jti-laptop-1');
      const token = tokens.createToken(household.userId, 'jti-laptop-1', 'laptop-1');
      expect(await connectorAnswer(token)).toBe('allowed');

      await new AccountDeletionService(database).deleteParentAccount(household.userId);

      expect(await connectorAnswer(token)).toBe(401);
      expect(
        await database.collection('slc_devices').countDocuments({ userId: household.userId })
      ).toBe(0);
      expect(
        await database
          .collection('revoked_connector_tokens')
          .countDocuments({ userId: household.userId })
      ).toBe(0);
    });

    it("does not touch another household's device", async () => {
      const leaving = await createHousehold('device-leaving@test.com');
      const staying = await createHousehold('device-staying@test.com');
      await seedActiveConnectorJti(database, leaving.userId, 'laptop-1', 'jti-leaving');
      await seedActiveConnectorJti(database, staying.userId, 'laptop-1', 'jti-staying');
      const token = tokens.createToken(staying.userId, 'jti-staying', 'laptop-1');

      await new AccountDeletionService(database).deleteParentAccount(leaving.userId);

      expect(await connectorAnswer(token)).toBe('allowed');
    });
  });

  describe('files the household synced', () => {
    const META = { contentType: 'application/octet-stream', contentLength: 0 };

    function keysOf(household: IHousehold): { asset: string; old: string; skeleton: string } {
      return {
        asset: `source-${household.userId}/asset-1`,
        old: `source-${household.userId}/asset-2`,
        skeleton: `skeletons/${household.userId}/run-1/grades-abc123.json.enc`,
      };
    }

    async function seedFiles(store: IAssetStore, household: IHousehold): Promise<void> {
      const keys = keysOf(household);
      for (const key of Object.values(keys)) {
        await store.put(key, Readable.from(['file']), META);
      }
      const sourceId = `source-${household.userId}`;
      const { userId } = household;
      await database.collection('slc_assets').insertMany([
        { userId, sourceId, assetId: 'asset-1', storageKey: keys.asset, deletedAt: null },
        // Pruned from the family's pages, its file not yet removed.
        { userId, sourceId, assetId: 'asset-2', storageKey: keys.old, deletedAt: new Date() },
      ]);
      await database
        .collection('slc_run_skeletons')
        .insertOne({ userId, runId: 'run-1', step: 'grades', storageKey: keys.skeleton });
    }

    async function filesPresent(store: IAssetStore, household: IHousehold): Promise<boolean[]> {
      const keys = keysOf(household);
      return Promise.all(Object.values(keys).map((key) => store.exists(key)));
    }

    it('removes the stored materials and page skeletons, and only that household’s', async () => {
      const store = new LocalAssetStore(mkdtempSync(join(tmpdir(), 'account-deletion-files-')));
      const leaving = await createHousehold('files-leaving@test.com');
      const staying = await createHousehold('files-staying@test.com');
      await seedFiles(store, leaving);
      await seedFiles(store, staying);
      expect(await filesPresent(store, leaving)).toEqual([true, true, true]);
      const reported: unknown[] = [];

      await new AccountDeletionService(database, {
        assetStore: store,
        onFilesNotRemoved: (report) => reported.push(report),
      }).deleteParentAccount(leaving.userId);

      expect(await filesPresent(store, leaving)).toEqual([false, false, false]);
      expect(await filesPresent(store, staying)).toEqual([true, true, true]);
      expect(reported).toEqual([]);
    });

    it('keeps a file that another household’s row still points at, until that one leaves too', async () => {
      // The demo households are seeded with the same files under the same keys.
      const store = new LocalAssetStore(mkdtempSync(join(tmpdir(), 'account-deletion-files-')));
      const first = await createHousehold('files-shared-first@test.com');
      const second = await createHousehold('files-shared-second@test.com');
      const shared = 'demo/demo-asset-worksheet';
      await store.put(shared, Readable.from(['worksheet']), META);
      await database.collection('slc_assets').insertMany([
        { userId: first.userId, sourceId: 'demo', assetId: 'a', storageKey: shared },
        { userId: second.userId, sourceId: 'demo', assetId: 'b', storageKey: shared },
      ]);

      await new AccountDeletionService(database, { assetStore: store }).deleteParentAccount(
        first.userId
      );
      expect(await store.exists(shared)).toBe(true);
      expect(await database.collection('slc_assets').countDocuments({ storageKey: shared })).toBe(
        1
      );

      await new AccountDeletionService(database, { assetStore: store }).deleteParentAccount(
        second.userId
      );
      expect(await store.exists(shared)).toBe(false);
    });

    it('still deletes the account when a file cannot be removed, and reports how many', async () => {
      const real = new LocalAssetStore(mkdtempSync(join(tmpdir(), 'account-deletion-files-')));
      const failing: IAssetStore = {
        put: (key, stream, metadata) => real.put(key, stream, metadata),
        get: (key) => real.get(key),
        exists: (key) => real.exists(key),
        getSignedUrl: (key, seconds) => real.getSignedUrl(key, seconds),
        delete: async (key) => {
          if (key.endsWith('asset-1')) throw new Error('storage is down');
          await real.delete(key);
        },
      };
      const reported: Array<{ failed: number; total: number }> = [];
      const household = await createHousehold('files-failing@test.com');
      await seedFiles(failing, household);

      await new AccountDeletionService(database, {
        assetStore: failing,
        onFilesNotRemoved: (report) => reported.push(report),
      }).deleteParentAccount(household.userId);

      expect(await database.collection('users').countDocuments({})).toBe(0);
      expect(await database.collection('slc_assets').countDocuments({})).toBe(0);
      expect(reported).toEqual([{ failed: 1, total: 3 }]);
      expect(await filesPresent(real, household)).toEqual([true, false, false]);
    });

    it('removes nothing from storage when no store is given, and still deletes the rows', async () => {
      const store = new LocalAssetStore(mkdtempSync(join(tmpdir(), 'account-deletion-files-')));
      const household = await createHousehold('files-no-store@test.com');
      await seedFiles(store, household);

      await new AccountDeletionService(database).deleteParentAccount(household.userId);

      expect(await database.collection('slc_assets').countDocuments({})).toBe(0);
      expect(await filesPresent(store, household)).toEqual([true, true, true]);
    });
  });
});
