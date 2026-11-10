/**
 * Integration tests for /api/sharing (sharing-spec §4.3, phase S1) on the real-Mongo harness.
 *
 * Covers: multi-student invites (one group, one email), per-student duplicate skips, canAdmin on
 * every student, pending list from the JWT email, accept/decline by group or ids, token reuse /
 * expiry / invalidation, resend, leave, rate limits, `access` + `peopleCount` on the students
 * list, plan limits counting owned students only, and the /parents aliases.
 */
import request from 'supertest';
import { type Express } from 'express';
import { createHash } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { authRouter } from '../auth/auth';
import { studentsRouter } from '../students/students';
import { sharingRouter } from './sharing';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { closeTestApp, createTestApp } from '../../test-utils/createTestApp';
import { SharingService } from '../../services/sharing/SharingService';
import type {
  ISharingEmailSender,
  ISharingInviteEmail,
  ISharingLeftEmail,
} from '../../services/sharing/SharingInviteEmailSender';

const BASE_URL = 'http://test.example';
const OWNER = 'owner-s1@example.com';
const JESSICA = 'jessica-s1@example.com';
const ROBERT = 'robert-s1@example.com';
const STRANGER = 'stranger-s1@example.com';
const NEWBIE = 'newbie-s1@example.com';
const ALL_EMAILS = [OWNER, JESSICA, ROBERT, STRANGER, NEWBIE];

interface IUserCtx {
  id: string;
  token: string;
}

function mailStub(): ISharingEmailSender & {
  invites: ISharingInviteEmail[];
  notices: ISharingLeftEmail[];
} {
  const invites: ISharingInviteEmail[] = [];
  const notices: ISharingLeftEmail[] = [];
  return {
    invites,
    notices,
    async sendInvite(opts) {
      invites.push(opts);
    },
    async sendLeftNotice(opts) {
      notices.push(opts);
    },
  };
}

function tokenOf(inviteUrl: string): string {
  const token = new URL(inviteUrl).searchParams.get('token');
  if (!token) throw new Error('invite url without token');
  return token;
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

describe('/api/sharing (S1)', () => {
  jest.setTimeout(60_000);

  let app: Express;
  let database: Db;
  let authService: AuthService;
  let mail: ReturnType<typeof mailStub>;
  let sharing: SharingService;
  let harness: Awaited<ReturnType<typeof createTestApp>>;
  let owner: IUserCtx;
  let jessica: IUserCtx;
  let robert: IUserCtx;
  let stranger: IUserCtx;

  beforeAll(async () => {
    mail = mailStub();
    harness = await createTestApp({
      skipOnConnectFailure: true,
      configure: ({ app: testApp, database: db }) => {
        database = db;
        app = testApp;
        authService = new AuthService(db);
        // One SharingService for both routers, exactly as server.ts wires it.
        sharing = new SharingService({ database: db, baseUrl: BASE_URL, emailSender: mail });
        testApp.use('/api/auth', authRouter({ database: db, authService, baseUrl: BASE_URL }));
        testApp.use(
          '/api/students',
          authMiddleware(authService),
          requireParent,
          studentsRouter({ database: db, baseUrl: BASE_URL, sharing })
        );
        testApp.use(
          '/api/sharing',
          authMiddleware(authService),
          requireParent,
          sharingRouter({ database: db, sharing })
        );
      },
    });
  });

  afterAll(async () => {
    if (harness) await closeTestApp(harness);
  });

  async function register(email: string, name: string): Promise<IUserCtx> {
    const res = await authService.register(email, 'password123', name);
    if (!res.success || !res.user?.id || !res.token) {
      throw new Error(`register failed for ${email}: ${res.error ?? ''}`);
    }
    return { id: res.user.id, token: res.token };
  }

  async function familyPlan(userId: string): Promise<void> {
    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan: 'family',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: now,
      updatedAt: now,
      events: [{ type: 'created', toPlan: 'family', timestamp: now }],
    });
  }

  async function createStudent(name: string, as: IUserCtx = owner): Promise<string> {
    const res = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${as.token}`)
      .send({ name, grade: 8 });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function invite(
    body: Record<string, unknown>,
    as: IUserCtx = owner
  ): Promise<request.Response> {
    return request(app)
      .post('/api/sharing/invites')
      .set('Authorization', `Bearer ${as.token}`)
      .send(body);
  }

  async function sharedWithOf(studentId: string): Promise<Record<string, unknown>[]> {
    const doc = await database.collection('students').findOne({ _id: new ObjectId(studentId) });
    return (doc?.['sharedWith'] as Record<string, unknown>[]) ?? [];
  }

  async function auditActions(studentId: string): Promise<string[]> {
    const rows = await database
      .collection('audit_logs')
      .find({ entityType: 'student_sharing', entityId: studentId })
      .toArray();
    return rows.map((r) => r['action'] as string).sort();
  }

  beforeEach(async () => {
    if (!database) return;
    mail.invites.length = 0;
    mail.notices.length = 0;
    await database.collection('students').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('users').deleteMany({ email: { $in: ALL_EMAILS } });
    await database.collection('magic_login_tokens').deleteMany({});
    await database.collection('sharing_rate_limits').deleteMany({});
    await database.collection('audit_logs').deleteMany({ entityType: 'student_sharing' });
    owner = await register(OWNER, 'Ricardo Owner');
    jessica = await register(JESSICA, 'Jessica Lewis');
    robert = await register(ROBERT, 'Robert Lewis');
    stranger = await register(STRANGER, 'Stranger');
    await familyPlan(owner.id);
  });

  // ── invites ────────────────────────────────────────────────────────────────

  describe('POST /invites', () => {
    it('invites one person to three students with one group and ONE email', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const gideon = await createStudent('Gideon');

      const res = await invite({
        email: JESSICA.toUpperCase(),
        name: 'Jessica',
        label: 'parent',
        isAdmin: true,
        studentIds: [ava, christian, gideon],
        alertChannels: ['email', 'push'],
      });

      expect(res.status).toBe(201);
      expect(typeof res.body.inviteGroupId).toBe('string');
      expect(res.body.perStudent).toEqual([
        { studentId: ava, status: 'invited' },
        { studentId: christian, status: 'invited' },
        { studentId: gideon, status: 'invited' },
      ]);
      expect(res.body.smsOptInUrl).toBeUndefined();

      expect(mail.invites).toHaveLength(1);
      const sent = mail.invites[0]!;
      expect(sent.to).toBe(JESSICA);
      expect(sent.recipientName).toBe('Jessica');
      expect(sent.inviterName).toBe('Ricardo Owner');
      expect(sent.studentNames).toEqual(['Ava', 'Christian', 'Gideon']);
      expect(sent.inviteUrl).toMatch(/^http:\/\/test\.example\/magic\?token=/);
      expect(sent.expiresInDays).toBe(7);

      for (const id of [ava, christian, gideon]) {
        const [entry] = await sharedWithOf(id);
        expect(entry).toMatchObject({
          email: JESSICA,
          name: 'Jessica',
          role: 'parent',
          isAdmin: true,
          status: 'pending',
          inviteGroupId: res.body.inviteGroupId,
          invitedByUserId: owner.id,
          alertChannels: ['email', 'push'],
        });
        expect(await auditActions(id)).toEqual(['sharing:invite']);
      }
      const tokens = await database
        .collection('magic_login_tokens')
        .find({ kind: 'inviteGroup' })
        .toArray();
      expect(tokens).toHaveLength(1);
      expect((tokens[0]!['studentIds'] as ObjectId[]).map(String).sort()).toEqual(
        [ava, christian, gideon].sort()
      );
    });

    it('reports already-invited and already-accepted students per student, never as an error', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const first = await invite({ email: JESSICA, label: 'parent', studentIds: [ava] });
      expect(first.status).toBe(201);
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: first.body.inviteGroupId })
        .expect(200);
      expect(
        (await invite({ email: JESSICA, label: 'parent', studentIds: [christian] })).status
      ).toBe(201);
      mail.invites.length = 0;

      const gideon = await createStudent('Gideon');
      const res = await invite({
        email: JESSICA,
        label: 'guardian',
        studentIds: [ava, christian, gideon],
      });

      expect(res.status).toBe(201);
      expect(res.body.perStudent).toEqual([
        { studentId: ava, status: 'already_accepted' },
        { studentId: christian, status: 'already_invited' },
        { studentId: gideon, status: 'invited' },
      ]);
      // One email, for the one newly invited student only.
      expect(mail.invites).toHaveLength(1);
      expect(mail.invites[0]!.studentNames).toEqual(['Gideon']);
      // The accepted row was not touched.
      expect((await sharedWithOf(ava))[0]!['status']).toBe('accepted');

      // Nothing new: no email, still not an error.
      mail.invites.length = 0;
      const again = await invite({ email: JESSICA, label: 'parent', studentIds: [ava, christian] });
      expect(again.status).toBe(201);
      expect(again.body.perStudent.map((p: { status: string }) => p.status)).toEqual([
        'already_accepted',
        'already_invited',
      ]);
      expect(mail.invites).toHaveLength(0);
    });

    it('requires admin on EVERY student: 404 without access, 403 as a member, nothing written', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      // Robert becomes a member (not admin) of Ava.
      const inv = await invite({ email: ROBERT, label: 'guardian', studentIds: [ava] });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${robert.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);
      mail.invites.length = 0;

      const noAccess = await invite(
        { email: STRANGER, label: 'parent', studentIds: [christian] },
        robert
      );
      expect(noAccess.status).toBe(404);
      const member = await invite({ email: STRANGER, label: 'parent', studentIds: [ava] }, robert);
      expect(member.status).toBe(403);
      // A mixed list is refused as a whole before any write.
      const ownKid = await createStudent('Roberts Kid', robert);
      const mixed = await invite(
        { email: STRANGER, label: 'parent', studentIds: [ownKid, christian] },
        robert
      );
      expect(mixed.status).toBe(404);
      expect(await sharedWithOf(ownKid)).toEqual([]);
      expect((await sharedWithOf(christian)).length).toBe(0);
      expect(mail.invites).toHaveLength(0);
    });

    it('validates the body and refuses self-invites', async () => {
      const ava = await createStudent('Ava');
      expect((await invite({ email: 'nope', label: 'parent', studentIds: [ava] })).status).toBe(
        400
      );
      expect((await invite({ email: JESSICA, label: 'parent', studentIds: [] })).status).toBe(400);
      expect(
        (await invite({ email: JESSICA, label: 'parent', studentIds: ['not-an-id'] })).status
      ).toBe(400);
      expect(
        (
          await invite({
            email: JESSICA,
            label: 'parent',
            studentIds: [ava],
            alertChannels: ['fax'],
          })
        ).status
      ).toBe(400);
      expect((await invite({ email: OWNER, label: 'parent', studentIds: [ava] })).status).toBe(400);
      // Inviting the owner's own address on their student is a skip, not an error, when sent by an admin.
      expect(await sharedWithOf(ava)).toEqual([]);
    });

    it('returns an SMS opt-in link (and texts nobody) when a phone and texts are requested', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const res = await invite({
        email: JESSICA,
        label: 'parent',
        phone: '+15551234567',
        alertChannels: ['email', 'sms'],
        studentIds: [ava, christian],
      });
      expect(res.status).toBe(201);
      expect(res.body.smsOptInUrl).toMatch(/^http:\/\/test\.example\//);
      const list = await request(app)
        .get(`/api/students/${ava}/contacts`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      const jess = list.body.find((c: { email?: string }) => c.email === JESSICA);
      expect(jess.smsStatus).toBe('invited');
    });

    it('allows 20 invitations per account per day, then 429; no-op invites cost no slot', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      expect((await invite({ email: JESSICA, label: 'parent', studentIds: [ava] })).status).toBe(
        201
      );
      const day = new Date().toISOString().slice(0, 10);
      const key = `invite:${owner.id}:${day}`;
      const counter = database.collection('sharing_rate_limits');
      expect((await counter.findOne({ key }))?.['count']).toBe(1);
      await counter.updateOne({ key }, { $set: { count: 20 } });

      // Already invited: reported, not refused, and the counter does not move.
      const dup = await invite({ email: JESSICA, label: 'parent', studentIds: [ava] });
      expect(dup.status).toBe(201);
      expect(dup.body.perStudent).toEqual([{ studentId: ava, status: 'already_invited' }]);
      expect((await counter.findOne({ key }))?.['count']).toBe(20);
      // The per-student route's 409 is a no-op too.
      const dup409 = await request(app)
        .post(`/api/students/${ava}/contacts`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ email: JESSICA, role: 'parent' });
      expect(dup409.status).toBe(409);
      expect((await counter.findOne({ key }))?.['count']).toBe(20);

      // A real invitation over the cap is refused before anything is written.
      const res = await invite({ email: JESSICA, label: 'parent', studentIds: [christian] });
      expect(res.status).toBe(429);
      expect(await sharedWithOf(christian)).toEqual([]);
      expect(mail.invites).toHaveLength(1);
    });
  });

  // ── pending / accept / decline ─────────────────────────────────────────────

  describe('pending, accept and decline', () => {
    it('lists pending invitations for the caller only, from the JWT', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({
        email: JESSICA,
        label: 'parent',
        isAdmin: true,
        studentIds: [ava, christian],
      });

      const mine = await request(app)
        .get('/api/sharing/invites/pending')
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(mine.body).toHaveLength(2);
      expect(mine.body[0]).toMatchObject({
        studentId: ava,
        studentName: 'Ava',
        invitedBy: owner.id,
        invitedByName: 'Ricardo Owner',
        inviteGroupId: inv.body.inviteGroupId,
        invite: { email: JESSICA, role: 'parent', status: 'pending', isAdmin: true },
      });
      // Someone else sees nothing, whatever they put in the query.
      const peek = await request(app)
        .get(`/api/sharing/invites/pending?email=${encodeURIComponent(JESSICA)}`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(200);
      expect(peek.body).toEqual([]);
    });

    it('accepts a whole group: the students appear with access and peopleCount, the link dies', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({
        email: JESSICA,
        label: 'parent',
        isAdmin: true,
        studentIds: [ava, christian],
      });
      const token = tokenOf(mail.invites[0]!.inviteUrl);

      const accept = await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId });
      expect(accept.status).toBe(200);
      expect(accept.body.studentIds.sort()).toEqual([ava, christian].sort());
      // The invitation chose no channels, so accepting applies the S3 default (spec §8 Q4).
      for (const id of [ava, christian]) {
        const [entry] = await sharedWithOf(id);
        expect(entry).toMatchObject({ status: 'accepted', alertChannels: ['email', 'push'] });
      }

      const list = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(
        list.body
          .map((s: { id: string; access: string; peopleCount: number }) => [
            s.id,
            s.access,
            s.peopleCount,
          ])
          .sort()
      ).toEqual(
        [
          [ava, 'admin', 2],
          [christian, 'admin', 2],
        ].sort()
      );
      const ownerList = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(
        ownerList.body.every(
          (s: { access: string; peopleCount: number }) =>
            s.access === 'owner' && s.peopleCount === 2
        )
      ).toBe(true);
      expect(await auditActions(ava)).toEqual(['sharing:accept', 'sharing:invite']);

      // The accepted invitation's magic link is no longer valid.
      await request(app).post('/api/auth/magic').send({ token }).expect(401);
    });

    it('accepts a subset by studentIds and declines the rest; a declined person can be re-invited', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      await invite({ email: JESSICA, label: 'parent', studentIds: [ava, christian] });

      const accept = await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ studentIds: [ava] })
        .expect(200);
      expect(accept.body.studentIds).toEqual([ava]);
      const decline = await request(app)
        .post('/api/sharing/invites/decline')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ studentIds: [christian] })
        .expect(200);
      expect(decline.body.studentIds).toEqual([christian]);
      expect((await sharedWithOf(christian))[0]!['status']).toBe('declined');
      expect(await auditActions(christian)).toEqual(['sharing:decline', 'sharing:invite']);

      const again = await invite({ email: JESSICA, label: 'caregiver', studentIds: [christian] });
      expect(again.body.perStudent).toEqual([{ studentId: christian, status: 'invited' }]);
      const rows = await sharedWithOf(christian);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'pending', role: 'caregiver' });
    });

    it('never lets someone accept an invitation addressed to another email', async () => {
      const ava = await createStudent('Ava');
      const inv = await invite({ email: JESSICA, label: 'parent', studentIds: [ava] });
      const hijack = await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId, email: JESSICA });
      expect(hijack.status).toBe(404);
      const byIds = await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({ studentIds: [ava] });
      expect(byIds.status).toBe(404);
      expect((await sharedWithOf(ava))[0]!['status']).toBe('pending');
      const bad = await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({});
      expect(bad.status).toBe(400);
    });
  });

  // ── tokens ─────────────────────────────────────────────────────────────────

  describe('invitation links', () => {
    it('work once for a brand-new person, accept every student, and then are dead', async () => {
      const ava = await createStudent('Ava');
      const gideon = await createStudent('Gideon');
      await invite({ email: NEWBIE, label: 'parent', studentIds: [ava, gideon] });
      const token = tokenOf(mail.invites[0]!.inviteUrl);

      const first = await request(app).post('/api/auth/magic').send({ token });
      expect(first.status).toBe(200);
      expect(first.body.user).toMatchObject({ email: NEWBIE, role: 'parent' });
      // Invitation-created account: the clients show "Set a password" (forcePasswordReset).
      expect(first.body.forcePasswordReset).toBe(true);
      const newUserId = first.body.user.id as string;
      for (const id of [ava, gideon]) {
        expect((await sharedWithOf(id))[0]).toMatchObject({
          status: 'accepted',
          userId: newUserId,
        });
      }
      const list = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${first.body.token as string}`)
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body[0].access).toBe('member');

      await request(app).post('/api/auth/magic').send({ token }).expect(401);
    });

    it('refuse an expired link', async () => {
      const ava = await createStudent('Ava');
      const raw = 'expired-raw-token';
      await database.collection('magic_login_tokens').insertOne({
        kind: 'inviteGroup',
        inviteEmail: NEWBIE,
        studentIds: [new ObjectId(ava)],
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      });
      await request(app).post('/api/auth/magic').send({ token: raw }).expect(401);
      expect(await database.collection('users').findOne({ email: NEWBIE })).toBeNull();
    });

    it('die when an admin removes the invitation', async () => {
      const ava = await createStudent('Ava');
      await invite({ email: NEWBIE, label: 'parent', studentIds: [ava] });
      const token = tokenOf(mail.invites[0]!.inviteUrl);
      await request(app)
        .delete(`/api/students/${ava}/contacts/${encodeURIComponent(NEWBIE)}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      await request(app).post('/api/auth/magic').send({ token }).expect(401);
      expect(await auditActions(ava)).toEqual(['sharing:invite', 'sharing:remove']);
    });
  });

  // ── resend ─────────────────────────────────────────────────────────────────

  describe('POST /invites/:groupId/resend', () => {
    it('sends a fresh link (old one dead), admin only, 5 per group per day', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({ email: JESSICA, label: 'parent', studentIds: [ava, christian] });
      const groupId = inv.body.inviteGroupId as string;
      const oldToken = tokenOf(mail.invites[0]!.inviteUrl);

      const asStranger = await request(app)
        .post(`/api/sharing/invites/${groupId}/resend`)
        .set('Authorization', `Bearer ${stranger.token}`);
      expect(asStranger.status).toBe(403);
      const unknown = await request(app)
        .post('/api/sharing/invites/no-such-group/resend')
        .set('Authorization', `Bearer ${owner.token}`);
      expect(unknown.status).toBe(404);

      const res = await request(app)
        .post(`/api/sharing/invites/${groupId}/resend`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(res.status).toBe(200);
      expect(res.body.studentIds.sort()).toEqual([ava, christian].sort());
      expect(mail.invites).toHaveLength(2);
      expect(mail.invites[1]!.studentNames).toEqual(['Ava', 'Christian']);
      const newToken = tokenOf(mail.invites[1]!.inviteUrl);
      expect(newToken).not.toBe(oldToken);
      await request(app).post('/api/auth/magic').send({ token: oldToken }).expect(401);
      expect(await auditActions(ava)).toEqual(['sharing:invite', 'sharing:link_sent']);

      const day = new Date().toISOString().slice(0, 10);
      await database
        .collection('sharing_rate_limits')
        .updateOne({ key: `resend:${groupId}:${day}` }, { $set: { count: 5 } });
      const limited = await request(app)
        .post(`/api/sharing/invites/${groupId}/resend`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(limited.status).toBe(429);
      expect(mail.invites).toHaveLength(2);

      // The fresh link still signs Jessica in and accepts both.
      const consume = await request(app).post('/api/auth/magic').send({ token: newToken });
      expect(consume.status).toBe(200);
      expect(consume.body.forcePasswordReset).toBe(false);
      expect((await sharedWithOf(christian))[0]!['status']).toBe('accepted');
    });
  });

  describe('POST /invites/resend-contact', () => {
    it('mints a single-student group for a legacy pending row, then behaves like resend; admin only', async () => {
      const ava = await createStudent('Ava');
      // A row written before invitation groups existed: no inviteGroupId, no invitedByUserId.
      await database.collection('students').updateOne(
        { _id: new ObjectId(ava) },
        {
          $push: {
            sharedWith: {
              email: JESSICA,
              name: 'Jessica',
              role: 'parent',
              status: 'pending',
              invitedAt: new Date(),
              receiveAlerts: true,
              alertChannels: ['email'],
            },
          } as never,
        }
      );

      const asStranger = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({ studentId: ava, email: JESSICA });
      expect(asStranger.status).toBe(404);
      const badId = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ studentId: 'not-an-id', email: JESSICA });
      expect(badId.status).toBe(400);
      const notPending = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ studentId: ava, email: ROBERT });
      expect(notPending.status).toBe(404);
      expect(mail.invites).toHaveLength(0);

      const res = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ studentId: ava, email: JESSICA.toUpperCase() });
      expect(res.status).toBe(200);
      expect(res.body.studentIds).toEqual([ava]);
      expect(typeof res.body.inviteGroupId).toBe('string');
      expect(mail.invites).toHaveLength(1);
      expect(mail.invites[0]!.to).toBe(JESSICA);
      expect(mail.invites[0]!.studentNames).toEqual(['Ava']);
      const row = (await sharedWithOf(ava))[0]!;
      expect(row['inviteGroupId']).toBe(res.body.inviteGroupId);
      expect(row['invitedByUserId']).toBe(owner.id);
      expect(row['status']).toBe('pending');
      expect(await auditActions(ava)).toEqual(['sharing:link_sent']);

      // Now the row has a group: a second re-send is an ordinary group resend with a fresh link.
      const firstToken = tokenOf(mail.invites[0]!.inviteUrl);
      const again = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ studentId: ava, email: JESSICA });
      expect(again.status).toBe(200);
      expect(again.body.inviteGroupId).toBe(res.body.inviteGroupId);
      expect(mail.invites).toHaveLength(2);
      await request(app).post('/api/auth/magic').send({ token: firstToken }).expect(401);

      // A member (accepted, not admin) may not re-send someone else's invitation.
      const robertInvite = await invite({ email: ROBERT, label: 'parent', studentIds: [ava] });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${robert.token}`)
        .send({ inviteGroupId: robertInvite.body.inviteGroupId })
        .expect(200);
      const asMember = await request(app)
        .post('/api/sharing/invites/resend-contact')
        .set('Authorization', `Bearer ${robert.token}`)
        .send({ studentId: ava, email: JESSICA });
      expect(asMember.status).toBe(403);

      // The fresh link still signs Jessica in and accepts Ava.
      const consume = await request(app)
        .post('/api/auth/magic')
        .send({ token: tokenOf(mail.invites[1]!.inviteUrl) });
      expect(consume.status).toBe(200);
      const accepted = (await sharedWithOf(ava)).find((sp) => sp['email'] === JESSICA)!;
      expect(accepted['status']).toBe('accepted');
    });
  });

  describe('POST /invites validation', () => {
    it('refuses an empty alertChannels array: a person must be reachable somehow', async () => {
      const ava = await createStudent('Ava');
      const res = await invite({
        email: JESSICA,
        label: 'parent',
        studentIds: [ava],
        alertChannels: [],
      });
      expect(res.status).toBe(400);
      expect(await sharedWithOf(ava)).toEqual([]);
      expect(mail.invites).toHaveLength(0);
    });
  });

  describe('invitedBy on the students list', () => {
    it('names the inviter for shared students on GET /students and GET /students/:id, never for the owner', async () => {
      const ava = await createStudent('Ava');
      const inv = await invite({
        email: JESSICA,
        label: 'parent',
        isAdmin: true,
        studentIds: [ava],
      });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);

      const list = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].access).toBe('admin');
      expect(list.body[0].invitedBy).toEqual({ userId: owner.id, name: 'Ricardo Owner' });

      const one = await request(app)
        .get(`/api/students/${ava}`)
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(one.body.invitedBy).toEqual({ userId: owner.id, name: 'Ricardo Owner' });

      const ownerList = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(ownerList.body[0].access).toBe('owner');
      expect(ownerList.body[0]).not.toHaveProperty('invitedBy');
    });
  });

  // ── leave ──────────────────────────────────────────────────────────────────

  describe('POST /leave', () => {
    it('removes the caller, kills their links, audits, and emails the owner', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({ email: JESSICA, label: 'parent', studentIds: [ava, christian] });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);
      await database.collection('magic_login_tokens').insertOne({
        kind: 'sharedParent',
        userId: new ObjectId(jessica.id),
        tokenHash: sha256('jessica-login-link'),
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/api/sharing/leave')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ studentId: ava });
      expect(res.status).toBe(200);

      const list = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(list.body.map((s: { id: string }) => s.id)).toEqual([christian]);
      expect(await sharedWithOf(ava)).toEqual([]);
      expect(await auditActions(ava)).toEqual([
        'sharing:accept',
        'sharing:invite',
        'sharing:leave',
      ]);
      expect(mail.notices).toEqual([
        { to: OWNER, leaverName: 'Jessica Lewis', studentName: 'Ava', baseUrl: BASE_URL },
      ]);
      await request(app).post('/api/auth/magic').send({ token: 'jessica-login-link' }).expect(401);
      // The owner's view: back to one person.
      const ownerList = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(ownerList.body.find((s: { id: string }) => s.id === ava).peopleCount).toBe(1);
    });

    it("revokes only the links of the student being left; other students' links stay valid", async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({ email: ROBERT, label: 'guardian', studentIds: [ava, christian] });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${robert.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);
      const avaLink = tokenOf(
        (await sharing.magicLoginLink.issueForContact(ava, robert.id, null)).loginUrl
      );
      const christianLink = tokenOf(
        (await sharing.magicLoginLink.issueForContact(christian, robert.id, null)).loginUrl
      );

      await request(app)
        .post('/api/sharing/leave')
        .set('Authorization', `Bearer ${robert.token}`)
        .send({ studentId: ava })
        .expect(200);

      await request(app).post('/api/auth/magic').send({ token: avaLink }).expect(401);
      const stillValid = await request(app).post('/api/auth/magic').send({ token: christianLink });
      expect(stillValid.status).toBe(200);
      expect(stillValid.body.user.id).toBe(robert.id);
    });

    it('refuses the owner, strangers and bad bodies', async () => {
      const ava = await createStudent('Ava');
      const asOwner = await request(app)
        .post('/api/sharing/leave')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ studentId: ava });
      expect(asOwner.status).toBe(403);
      const asStranger = await request(app)
        .post('/api/sharing/leave')
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({ studentId: ava });
      expect(asStranger.status).toBe(404);
      const noBody = await request(app)
        .post('/api/sharing/leave')
        .set('Authorization', `Bearer ${stranger.token}`)
        .send({});
      expect(noBody.status).toBe(400);
      expect(mail.notices).toEqual([]);
    });
  });

  // ── mine ───────────────────────────────────────────────────────────────────

  describe('GET /mine', () => {
    it('shows each accessible student with access, inviter and own alert prefs', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const inv = await invite({
        email: JESSICA,
        label: 'parent',
        isAdmin: true,
        studentIds: [ava],
      });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);
      await request(app)
        .put(`/api/students/${ava}/contacts/${encodeURIComponent(JESSICA)}`)
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ receiveAlerts: false, alertChannels: ['email', 'push'] })
        .expect(200);

      const mineJ = await request(app)
        .get('/api/sharing/mine')
        .set('Authorization', `Bearer ${jessica.token}`)
        .expect(200);
      expect(mineJ.body).toEqual({
        students: [
          {
            studentId: ava,
            name: 'Ava',
            access: 'admin',
            invitedBy: { userId: owner.id, name: 'Ricardo Owner' },
            alerts: {
              receiveAlerts: false,
              alertChannels: ['email', 'push'],
              weeklyReviewCopy: false,
            },
          },
        ],
      });
      const mineO = await request(app)
        .get('/api/sharing/mine')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(
        mineO.body.students
          .map((s: { studentId: string; access: string }) => [s.studentId, s.access])
          .sort()
      ).toEqual(
        [
          [ava, 'owner'],
          [christian, 'owner'],
        ].sort()
      );
      expect(mineO.body.students[0].invitedBy).toBeUndefined();
      expect(mineO.body.students[0].alerts).toEqual({
        receiveAlerts: true,
        alertChannels: ['email'],
        weeklyReviewCopy: false,
      });
    });
  });

  // ── plan limits ────────────────────────────────────────────────────────────

  describe('plan limits count owned students only', () => {
    it('lets a free-plan co-parent with shared students add her own child, and caps her own', async () => {
      const ava = await createStudent('Ava');
      const christian = await createStudent('Christian');
      const gideon = await createStudent('Gideon');
      const inv = await invite({
        email: JESSICA,
        label: 'parent',
        studentIds: [ava, christian, gideon],
      });
      await request(app)
        .post('/api/sharing/invites/accept')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ inviteGroupId: inv.body.inviteGroupId })
        .expect(200);
      // Jessica has no subscription row: the free cap of one owned student applies.
      const own = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ name: 'Jessicas Kid', grade: 3 });
      expect(own.status).toBe(201);
      expect(own.body).toMatchObject({ access: 'owner', peopleCount: 1 });
      const second = await request(app)
        .post('/api/students')
        .set('Authorization', `Bearer ${jessica.token}`)
        .send({ name: 'Second Kid', grade: 1 });
      expect(second.status).toBe(403);
      expect(second.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(second.body.currentCount).toBe(1);
    });
  });

  // ── /parents aliases ───────────────────────────────────────────────────────

  describe('/:id/parents/* behave like /:id/contacts/*', () => {
    it('invite creates a single-student group with an email; duplicates are 409; removal is admin-only', async () => {
      const ava = await createStudent('Ava');
      const inv = await request(app)
        .post(`/api/students/${ava}/parents/invite`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ email: ROBERT, role: 'guardian' });
      expect(inv.status).toBe(201);
      expect(inv.body.message).toBe(`Invitation sent to ${ROBERT}`);
      expect(inv.body.invite).toEqual({ email: ROBERT, role: 'guardian', status: 'pending' });
      expect(typeof inv.body.inviteGroupId).toBe('string');
      expect(mail.invites).toHaveLength(1);
      expect(mail.invites[0]!.studentNames).toEqual(['Ava']);

      const dup = await request(app)
        .post(`/api/students/${ava}/contacts`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ email: ROBERT, role: 'parent' });
      expect(dup.status).toBe(409);

      await request(app)
        .post(`/api/students/${ava}/parents/accept`)
        .set('Authorization', `Bearer ${robert.token}`)
        .send({})
        .expect(200);
      const parents = await request(app)
        .get(`/api/students/${ava}/parents`)
        .set('Authorization', `Bearer ${robert.token}`)
        .expect(200);
      const robertRow = parents.body.find((p: { email?: string }) => p.email === ROBERT);
      expect(robertRow).toMatchObject({
        status: 'accepted',
        isAdmin: false,
        smsStatus: 'none',
        inviteGroupId: inv.body.inviteGroupId,
        invitedByUserId: owner.id,
      });

      // No self-removal through the legacy route (use /api/sharing/leave).
      const selfRemove = await request(app)
        .delete(`/api/students/${ava}/parents/${encodeURIComponent(ROBERT)}`)
        .set('Authorization', `Bearer ${robert.token}`);
      expect(selfRemove.status).toBe(403);
      const promote = await request(app)
        .put(`/api/students/${ava}/parents/${encodeURIComponent(ROBERT)}/admin`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ isAdmin: true });
      expect(promote.status).toBe(200);
      expect(promote.body.message).toContain('promoted to admin');
      const remove = await request(app)
        .delete(`/api/students/${ava}/parents/${encodeURIComponent(ROBERT)}`)
        .set('Authorization', `Bearer ${owner.token}`);
      expect(remove.status).toBe(200);
      expect(await sharedWithOf(ava)).toEqual([]);
    });
  });
});
