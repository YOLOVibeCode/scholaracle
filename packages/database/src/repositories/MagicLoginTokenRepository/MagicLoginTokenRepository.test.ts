import { MongoClient, ObjectId, type Db } from 'mongodb';
import { MagicLoginTokenRepository } from './MagicLoginTokenRepository';

describe('MagicLoginTokenRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: MagicLoginTokenRepository;

  const EMAIL = 'Invitee@Example.com';
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new MagicLoginTokenRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('magic_login_tokens').deleteMany({});
  });

  describe('inviteGroup tokens', () => {
    it('stores the email and students and returns them once on consume', async () => {
      const a = new ObjectId().toHexString();
      const b = new ObjectId().toHexString();
      const expiresAt = new Date(Date.now() + 7 * 24 * hour);
      await repository.createForInviteGroup(EMAIL, [a, b], 'hash-1', expiresAt, 'grp-1');

      const first = await repository.consumeValid('hash-1');
      expect(first).toEqual({
        inviteGroup: { email: 'invitee@example.com', studentIds: [a, b], inviteGroupId: 'grp-1' },
      });

      // Single use: the same hash is dead afterwards.
      expect(await repository.consumeValid('hash-1')).toBeNull();
    });

    it('refuses an expired token', async () => {
      const a = new ObjectId().toHexString();
      await repository.createForInviteGroup(EMAIL, [a], 'hash-old', new Date(Date.now() - hour));
      expect(await repository.consumeValid('hash-old')).toBeNull();
    });

    it('refuses to create a token with no students', async () => {
      await expect(
        repository.createForInviteGroup(EMAIL, [], 'hash-empty', new Date(Date.now() + hour))
      ).rejects.toThrow('at least one student');
    });

    it('removing one student narrows the token; removing the last one deletes it', async () => {
      const a = new ObjectId().toHexString();
      const b = new ObjectId().toHexString();
      const expiresAt = new Date(Date.now() + hour);
      await repository.createForInviteGroup(EMAIL, [a, b], 'hash-2', expiresAt);
      // A legacy per-student pending-invite token for the same pair goes too.
      await repository.createForPendingInvite(a, EMAIL, 'hash-legacy', expiresAt);

      await repository.invalidateUnusedForInviteEmailAndStudent('invitee@example.com', a);
      expect(await repository.consumeValid('hash-legacy')).toBeNull();

      const narrowed = await database
        .collection('magic_login_tokens')
        .findOne({ tokenHash: 'hash-2' });
      expect((narrowed?.['studentIds'] as ObjectId[]).map((id) => id.toHexString())).toEqual([b]);

      await repository.invalidateUnusedForInviteEmailAndStudent(EMAIL, b);
      expect(await repository.consumeValid('hash-2')).toBeNull();
    });

    it('does not touch tokens addressed to another email', async () => {
      const a = new ObjectId().toHexString();
      const expiresAt = new Date(Date.now() + hour);
      await repository.createForInviteGroup('other@example.com', [a], 'hash-other', expiresAt);

      await repository.invalidateUnusedForInviteEmailAndStudent(EMAIL, a);
      expect(await repository.consumeValid('hash-other')).not.toBeNull();
    });

    it('invalidates every unused token of a group before a resend', async () => {
      const a = new ObjectId().toHexString();
      const expiresAt = new Date(Date.now() + hour);
      await repository.createForInviteGroup(EMAIL, [a], 'hash-g1', expiresAt, 'grp-9');
      await repository.createForInviteGroup(EMAIL, [a], 'hash-g2', expiresAt, 'grp-9');
      await repository.createForInviteGroup(EMAIL, [a], 'hash-g3', expiresAt, 'grp-other');

      await repository.invalidateUnusedForInviteGroup('grp-9');

      expect(await repository.consumeValid('hash-g1')).toBeNull();
      expect(await repository.consumeValid('hash-g2')).toBeNull();
      expect(await repository.consumeValid('hash-g3')).not.toBeNull();
    });
  });

  describe('existing kinds keep working', () => {
    it('consumes a user token into { userId }', async () => {
      const userId = new ObjectId().toHexString();
      await repository.createForUser('sharedParent', userId, 'hash-u', new Date(Date.now() + hour));
      expect(await repository.consumeValid('hash-u')).toEqual({ userId });
    });

    it('consumes a pending-invite token into { pendingInvite }', async () => {
      const studentId = new ObjectId().toHexString();
      await repository.createForPendingInvite(
        studentId,
        EMAIL,
        'hash-p',
        new Date(Date.now() + hour)
      );
      expect(await repository.consumeValid('hash-p')).toEqual({
        pendingInvite: { studentId, email: 'invitee@example.com' },
      });
    });
  });
});
