import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
  UserRepository,
} from '@scholaracle/database';
import { AccountDeletionService } from './AccountDeletionService';

const PASSWORD = 'HouseholdDel123!';

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
});
