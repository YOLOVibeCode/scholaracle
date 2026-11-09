/**
 * POST /api/auth/magic with a sharing invite-group token (sharing-spec §4.3, S1):
 *  - a brand-new invitee gets a parent account with a random password and `forcePasswordReset`
 *    (the clients' "set a password" prompt), every pending entry for that email among the
 *    token's students is accepted, and they are signed in;
 *  - the lookup is case-insensitive, so an existing "Jessica@Example.com" account is bound
 *    instead of a duplicate being created;
 *  - an existing account is signed in and accepted without touching its password;
 *  - the flag is cleared by the reset-password flow and by an OAuth sign-in;
 *  - the legacy single-student pending-invite token still works.
 */
import request from 'supertest';
import { type Express } from 'express';
import { ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import {
  OAuthAccountRepository,
  PasswordResetTokenRepository,
  StudentRepository,
  UserRepository,
} from '@scholaracle/database';
import { authRouter } from './auth';
import { closeTestApp, createTestApp } from '../../test-utils/createTestApp';
import { MagicLoginLink } from '../../services/provision/MagicLoginLink';

const BASE_URL = 'http://test.example';
const OWNER = 'owner-mig@example.com';
const EXISTING = 'existing-mig@example.com';
const NEWBIE = 'newbie-mig@example.com';
const MIXED_CASE = 'Jessica-Mig@Example.com';
const INTERNAL_SECRET = 'magic-invite-group-test-secret';

describe('POST /api/auth/magic with an invite-group token', () => {
  jest.setTimeout(60_000);

  let app: Express;
  let database: Db;
  let authService: AuthService;
  let resetTokens: PasswordResetTokenRepository;
  let harness: Awaited<ReturnType<typeof createTestApp>>;
  let ownerId: string;
  let savedSecret: string | undefined;

  beforeAll(async () => {
    savedSecret = process.env['INTERNAL_API_SECRET'];
    process.env['INTERNAL_API_SECRET'] = INTERNAL_SECRET;
    harness = await createTestApp({
      skipOnConnectFailure: true,
      configure: ({ app: testApp, database: db }) => {
        database = db;
        app = testApp;
        resetTokens = new PasswordResetTokenRepository(db);
        const oauthAccounts = new OAuthAccountRepository(db);
        authService = new AuthService(
          db,
          undefined,
          undefined,
          resetTokens,
          { sendResetLink: async (): Promise<void> => {} },
          undefined,
          undefined,
          undefined,
          undefined,
          oauthAccounts
        );
        testApp.use(
          '/api/auth',
          authRouter({
            database: db,
            authService,
            baseUrl: BASE_URL,
            passwordResetTokenStore: resetTokens,
            oauthAccountRepository: oauthAccounts,
          })
        );
      },
    });
  });

  afterAll(async () => {
    if (savedSecret === undefined) delete process.env['INTERNAL_API_SECRET'];
    else process.env['INTERNAL_API_SECRET'] = savedSecret;
    if (harness) await closeTestApp(harness);
  });

  beforeEach(async () => {
    if (!database) return;
    await database.collection('students').deleteMany({});
    await database.collection('users').deleteMany({
      email: { $in: [OWNER, EXISTING, NEWBIE, MIXED_CASE, MIXED_CASE.toLowerCase()] },
    });
    await database.collection('magic_login_tokens').deleteMany({});
    await database.collection('password_reset_tokens').deleteMany({});
    await database.collection('oauth_accounts').deleteMany({});
    await database.collection('audit_logs').deleteMany({ entityType: 'student_sharing' });
    const owner = await authService.register(OWNER, 'password123', 'Owner');
    if (!owner.user?.id) throw new Error('owner registration failed');
    ownerId = owner.user.id;
  });

  async function studentWithPendingInvite(name: string, email: string): Promise<string> {
    const created = await new StudentRepository(database).create({
      userId: new ObjectId(ownerId),
      name,
      sharedWith: [
        {
          email,
          role: 'parent',
          status: 'pending',
          invitedAt: new Date(),
          inviteGroupId: 'grp-test',
          invitedByUserId: ownerId,
        },
      ],
    });
    return created._id!.toString();
  }

  async function groupLink(email: string, studentIds: string[]): Promise<string> {
    const issued = await new MagicLoginLink({ database, baseUrl: BASE_URL }).issueForInviteGroup(
      email,
      studentIds,
      'grp-test'
    );
    return new URL(issued.loginUrl).searchParams.get('token')!;
  }

  async function userDoc(email: string): Promise<Record<string, unknown> | null> {
    return database.collection('users').findOne({ email });
  }

  it('creates the parent account with forcePasswordReset, accepts every student, signs in', async () => {
    const ava = await studentWithPendingInvite('Ava', NEWBIE);
    const gideon = await studentWithPendingInvite('Gideon', NEWBIE);
    // A student the token does not cover stays pending.
    const other = await studentWithPendingInvite('Other', NEWBIE);
    const token = await groupLink(NEWBIE, [ava, gideon]);

    const res = await request(app).post('/api/auth/magic').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({ email: NEWBIE, role: 'parent' });
    expect(res.body.forcePasswordReset).toBe(true);
    expect(typeof res.body.token).toBe('string');
    const user = await userDoc(NEWBIE);
    expect(user?.['forcePasswordReset']).toBe(true);
    expect(typeof user?.['passwordHash']).toBe('string');

    const students = new StudentRepository(database);
    for (const id of [ava, gideon]) {
      const s = await students.findById(id);
      expect(s?.sharedWith[0]).toMatchObject({
        status: 'accepted',
        userId: user!['_id']!.toString(),
        alertChannels: ['email'],
      });
    }
    expect((await students.findById(other))?.sharedWith[0]?.status).toBe('pending');
    const audit = await database
      .collection('audit_logs')
      .find({ entityType: 'student_sharing', action: 'sharing:accept' })
      .toArray();
    expect(audit.map((a) => a['entityId']).sort()).toEqual([ava, gideon].sort());
    // The invitee, not "unknown", is the actor even though the route is public.
    expect(audit[0]?.['adminUserId']).toBe(user!['_id']!.toString());

    // Single use.
    await request(app).post('/api/auth/magic').send({ token }).expect(401);
  });

  it('binds a case-different existing account instead of creating a duplicate', async () => {
    // A legacy row written before emails were normalised on write.
    const legacy = await new UserRepository(database).create({
      email: MIXED_CASE,
      passwordHash: 'legacy-hash',
      name: 'Jessica',
    });
    const lower = MIXED_CASE.toLowerCase();
    const ava = await studentWithPendingInvite('Ava', lower);
    const token = await groupLink(lower, [ava]);

    const res = await request(app).post('/api/auth/magic').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(legacy._id!.toString());
    expect(res.body.forcePasswordReset).toBe(false);
    const matching = await database
      .collection('users')
      .countDocuments({ email: { $regex: /^jessica-mig@example\.com$/i } });
    expect(matching).toBe(1);
    expect((await new StudentRepository(database).findById(ava))?.sharedWith[0]).toMatchObject({
      status: 'accepted',
      userId: legacy._id!.toString(),
    });
  });

  it('signs an existing account in and accepts, leaving its password and flag alone', async () => {
    const existing = await authService.register(EXISTING, 'password123', 'Existing Parent');
    const ava = await studentWithPendingInvite('Ava', EXISTING);
    const token = await groupLink(EXISTING, [ava]);

    const res = await request(app).post('/api/auth/magic').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(existing.user?.id);
    expect(res.body.forcePasswordReset).toBe(false);
    expect((await new StudentRepository(database).findById(ava))?.sharedWith[0]).toMatchObject({
      status: 'accepted',
      userId: existing.user?.id,
    });
    // The password still works.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EXISTING, password: 'password123' });
    expect(login.status).toBe(200);
  });

  it('clears forcePasswordReset once the person sets a password through the reset flow', async () => {
    const ava = await studentWithPendingInvite('Ava', NEWBIE);
    const token = await groupLink(NEWBIE, [ava]);
    const consumed = await request(app).post('/api/auth/magic').send({ token }).expect(200);
    const userId = consumed.body.user.id as string;

    await resetTokens.create(userId, 'reset-raw-token', new Date(Date.now() + 60 * 60 * 1000));
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'reset-raw-token', newPassword: 'chosen-password-1' })
      .expect(200);

    expect((await userDoc(NEWBIE))?.['forcePasswordReset']).toBe(false);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: NEWBIE, password: 'chosen-password-1' });
    expect(login.status).toBe(200);
    expect(login.body.forcePasswordReset).toBe(false);
  });

  it('clears forcePasswordReset when the person signs in with an OAuth provider instead', async () => {
    const ava = await studentWithPendingInvite('Ava', NEWBIE);
    const token = await groupLink(NEWBIE, [ava]);
    const consumed = await request(app).post('/api/auth/magic').send({ token }).expect(200);
    expect(consumed.body.forcePasswordReset).toBe(true);

    const oauth = await request(app)
      .post('/api/auth/oauth')
      .set('x-internal-api-secret', INTERNAL_SECRET)
      .send({
        provider: 'google',
        providerAccountId: 'google-newbie-1',
        email: NEWBIE.toUpperCase(),
        name: 'Newbie',
      });

    expect(oauth.status).toBe(200);
    expect(oauth.body.user.id).toBe(consumed.body.user.id);
    expect(oauth.body.forcePasswordReset).toBe(false);
    expect((await userDoc(NEWBIE))?.['forcePasswordReset']).toBe(false);
    // Still one account, lower-cased.
    expect(
      await database.collection('users').countDocuments({ email: { $regex: /^newbie-mig@/i } })
    ).toBe(1);
  });

  it('still accepts a legacy single-student pending-invite token', async () => {
    const ava = await studentWithPendingInvite('Ava', NEWBIE);
    const issued = await new MagicLoginLink({ database, baseUrl: BASE_URL }).issueForContact(
      ava,
      null,
      NEWBIE
    );
    const token = new URL(issued.loginUrl).searchParams.get('token')!;

    const res = await request(app).post('/api/auth/magic').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: NEWBIE, role: 'parent' });
    expect(res.body.forcePasswordReset).toBe(true);
    expect((await new StudentRepository(database).findById(ava))?.sharedWith[0]?.status).toBe(
      'accepted'
    );
  });

  it('rejects an expired or unknown token without creating an account', async () => {
    const ava = await studentWithPendingInvite('Ava', NEWBIE);
    const link = new MagicLoginLink({
      database,
      baseUrl: BASE_URL,
      now: () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    const issued = await link.issueForInviteGroup(NEWBIE, [ava], 'grp-old');
    const expired = new URL(issued.loginUrl).searchParams.get('token')!;

    await request(app).post('/api/auth/magic').send({ token: expired }).expect(401);
    await request(app).post('/api/auth/magic').send({ token: 'nope' }).expect(401);
    expect(await userDoc(NEWBIE)).toBeNull();
  });
});
