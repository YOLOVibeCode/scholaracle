import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { IStudentData } from '@scholaracle/database';
import { createReminderRecipientResolver } from './reminderRecipients';

interface IHouseholdOptions {
  /** The student has a sign-in (default). False: the parent never set one up. */
  readonly withLogin?: boolean;
  /**
   * The parent took the sign-in away. As `StudentProvisioner.revoke` leaves it: the student
   * no longer names a login, and the login's user row stays, suspended, with its phone.
   */
  readonly loginRevoked?: boolean;
  /** The login's account is suspended while the student still names it. */
  readonly loginSuspended?: boolean;
  readonly studentDevice?: boolean;
  readonly ownerDevice?: boolean;
  readonly ownerAlertPrefs?: IStudentData['ownerAlertPrefs'];
}

interface IHousehold {
  readonly ownerId: string;
  readonly studentId: string;
  readonly studentUserId: string;
  readonly studentEmail: string;
}

const OWNER_EMAIL = 'owner@example.com';

describe('createReminderRecipientResolver', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(`reminder_recipients_${process.pid}`);
  });

  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await db.collection('students').deleteMany({});
    await db.collection('users').deleteMany({});
  });

  function device(token: string, audience: 'student' | 'parent'): Record<string, unknown> {
    return {
      deviceId: `phone-${token}`,
      type: 'ios',
      pushToken: token,
      lastActive: new Date(),
      audience,
    };
  }

  async function seedHousehold(options: IHouseholdOptions = {}): Promise<IHousehold> {
    const ownerId = new ObjectId();
    const studentId = new ObjectId();
    const studentUserId = new ObjectId();
    const withLogin = options.withLogin ?? true;
    const studentEmail = `student-${studentUserId.toString()}@logins.example`;
    const now = new Date();
    await db.collection('users').insertOne({
      _id: ownerId,
      email: OWNER_EMAIL,
      name: 'Ricardo Owner',
      role: 'parent',
      devices: options.ownerDevice === true ? [device('ExponentPushToken[owner]', 'parent')] : [],
    });
    await db.collection('students').insertOne({
      _id: studentId,
      userId: ownerId.toString(),
      name: 'Gideon Vega',
      studentId: `S-${studentId.toString().slice(-4)}`,
      dataSources: [],
      ...(withLogin && options.loginRevoked !== true
        ? { studentLogin: { userId: studentUserId.toString(), showGrades: false, createdAt: now } }
        : {}),
      ...(options.ownerAlertPrefs !== undefined
        ? { ownerAlertPrefs: options.ownerAlertPrefs }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
    if (withLogin) {
      await db.collection('users').insertOne({
        _id: studentUserId,
        email: studentEmail,
        name: 'Gideon Vega',
        role: 'student',
        studentId: studentId.toString(),
        ...(options.loginRevoked === true || options.loginSuspended === true
          ? { isSuspended: true, suspendedReason: 'student_login_revoked' }
          : {}),
        devices:
          options.studentDevice === false ? [] : [device('ExponentPushToken[gideon]', 'student')],
      });
    }
    return {
      ownerId: ownerId.toString(),
      studentId: studentId.toString(),
      studentUserId: studentUserId.toString(),
      studentEmail,
    };
  }

  describe('a student', () => {
    it('is reached on their own phone and at their login email', async () => {
      const home = await seedHousehold();

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({ email: home.studentEmail, pushUserId: home.studentUserId });
    });

    it('is reached by email alone when no phone is registered', async () => {
      const home = await seedHousehold({ studentDevice: false });

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({ email: home.studentEmail });
    });

    it('cannot be reached when the parent has not set up a student login', async () => {
      const home = await seedHousehold({ withLogin: false });

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({});
    });

    it('gets nothing once the parent has taken the sign-in away', async () => {
      // The login's row, address and phone are all still in the database.
      const home = await seedHousehold({ loginRevoked: true });

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({});
    });

    it('gets nothing while their account is suspended', async () => {
      const home = await seedHousehold({ loginSuspended: true });

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({});
    });

    it("never gets the parent's address or phone", async () => {
      const home = await seedHousehold({
        withLogin: false,
        ownerDevice: true,
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'push'] },
      });

      const to = await createReminderRecipientResolver(db)('student', home.studentId);

      expect(to).toEqual({});
    });
  });

  describe('a parent', () => {
    it('gets the email, and no push unless they asked for push', async () => {
      // An owner's alert channels default to email alone.
      const home = await seedHousehold({ ownerDevice: true });

      const to = await createReminderRecipientResolver(db)('parent', home.studentId);

      expect(to).toEqual({ email: OWNER_EMAIL });
    });

    it('gets a push on their own phone when they chose push for this student', async () => {
      const home = await seedHousehold({
        ownerDevice: true,
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'push'] },
      });

      const to = await createReminderRecipientResolver(db)('parent', home.studentId);

      expect(to).toEqual({ email: OWNER_EMAIL, pushUserId: home.ownerId });
    });

    it('gets no push when they chose push and no phone is registered', async () => {
      const home = await seedHousehold({
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'push'] },
      });

      const to = await createReminderRecipientResolver(db)('parent', home.studentId);

      expect(to).toEqual({ email: OWNER_EMAIL });
    });

    it('gets no push when they turned alerts off for this student', async () => {
      const home = await seedHousehold({
        ownerDevice: true,
        ownerAlertPrefs: { receiveAlerts: false, alertChannels: ['email', 'push'] },
      });

      const to = await createReminderRecipientResolver(db)('parent', home.studentId);

      expect(to).toEqual({ email: OWNER_EMAIL });
    });

    it("never gets a push on the student's phone", async () => {
      const home = await seedHousehold({
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'push'] },
      });

      const to = await createReminderRecipientResolver(db)('parent', home.studentId);

      expect(to.pushUserId).toBeUndefined();
    });
  });

  it('reaches nobody for a student that does not exist or an id that is not an id', async () => {
    const resolve = createReminderRecipientResolver(db);

    expect(await resolve('student', new ObjectId().toString())).toEqual({});
    expect(await resolve('parent', new ObjectId().toString())).toEqual({});
    expect(await resolve('student', 'not-an-id')).toEqual({});
    expect(await resolve('parent', 'not-an-id')).toEqual({});
  });
});
