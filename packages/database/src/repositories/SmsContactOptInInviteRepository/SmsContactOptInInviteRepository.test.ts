import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SmsContactOptInInviteRepository } from './SmsContactOptInInviteRepository';

describe('SmsContactOptInInviteRepository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: SmsContactOptInInviteRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('sms_optin_invite_test');
    repo = new SmsContactOptInInviteRepository(database);
    await repo.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('sms_contact_optin_invites').deleteMany({});
  });

  const base = {
    studentId: 'student-1',
    contactEmail: 'coparent@example.com',
    inviterName: 'Alex',
  };

  it('issues an unguessable token that finds the invite', async () => {
    const invite = await repo.issue({ ...base, phoneE164: '+15125550100' });
    expect(invite.token).toMatch(/^[a-f0-9]{48}$/);
    const found = await repo.findActiveByToken(invite.token);
    expect(found?.contactEmail).toBe('coparent@example.com');
    expect(found?.phoneE164).toBe('+15125550100');
    expect(found?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('retires the earlier unused link when a new one is issued for the same contact', async () => {
    const first = await repo.issue(base);
    const second = await repo.issue(base);
    expect(await repo.findActiveByToken(first.token)).toBeNull();
    expect((await repo.findActiveByToken(second.token))?.token).toBe(second.token);
    expect((await repo.findLatestForContact('student-1', 'coparent@example.com'))?.token).toBe(
      second.token
    );
  });

  it('stops working once used and records the consented number', async () => {
    const invite = await repo.issue(base);
    await repo.markUsed(invite.token, '+15125550111');
    expect(await repo.findActiveByToken(invite.token)).toBeNull();
    const latest = await repo.findLatestForContact('student-1', 'coparent@example.com');
    expect(latest?.consentedPhoneE164).toBe('+15125550111');
    expect(latest?.usedAt).toBeInstanceOf(Date);
  });

  it('does not return an expired invite', async () => {
    const invite = await repo.issue(base);
    await database
      .collection('sms_contact_optin_invites')
      .updateOne({ token: invite.token }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await repo.findActiveByToken(invite.token)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await repo.findActiveByToken('nope')).toBeNull();
  });
});
