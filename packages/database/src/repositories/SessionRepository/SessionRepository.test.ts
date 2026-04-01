import { MongoClient, ObjectId, type Db } from 'mongodb';
import { SessionRepository } from './SessionRepository';

describe('SessionRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: SessionRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new SessionRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('sessions').deleteMany({});
  });

  const makeSessionInput = (overrides: Record<string, unknown> = {}) => ({
    userId: new ObjectId().toString(),
    userType: 'user' as const,
    refreshTokenFamilyId: `family-${Date.now()}`,
    deviceInfo: { userAgent: 'test-agent', browser: 'Chrome', os: 'macOS' },
    ipAddress: '127.0.0.1',
    lastActiveAt: new Date(),
    ...overrides,
  });

  describe('create', () => {
    it('creates a session and returns a session record', async () => {
      const input = makeSessionInput();
      const session = await repository.create(input);

      expect(session._id).toBeDefined();
      expect(session._id).toBeInstanceOf(ObjectId);
      expect(session.userId).toBe(input.userId);
      expect(session.userType).toBe('user');
      expect(session.refreshTokenFamilyId).toBe(input.refreshTokenFamilyId);
      expect(session.ipAddress).toBe('127.0.0.1');
    });

    it('sets createdAt timestamp', async () => {
      const before = new Date();
      const session = await repository.create(makeSessionInput());
      const after = new Date();

      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('persists the session to the database', async () => {
      const session = await repository.create(makeSessionInput());

      const doc = await database.collection('sessions').findOne({ _id: session._id });
      expect(doc).toBeTruthy();
    });
  });

  describe('findByFamilyId', () => {
    it('finds a session by userId, userType, and familyId', async () => {
      const userId = new ObjectId().toString();
      const familyId = 'family-lookup-test';
      await repository.create(makeSessionInput({ userId, refreshTokenFamilyId: familyId }));

      const found = await repository.findByFamilyId(userId, 'user', familyId);

      expect(found).not.toBeNull();
      expect(found?.userId).toBe(userId);
      expect(found?.refreshTokenFamilyId).toBe(familyId);
    });

    it('returns null when no matching session exists', async () => {
      const found = await repository.findByFamilyId(
        new ObjectId().toString(),
        'user',
        'non-existent'
      );

      expect(found).toBeNull();
    });

    it('does not return revoked sessions', async () => {
      const userId = new ObjectId().toString();
      const familyId = 'family-revoked';
      const session = await repository.create(
        makeSessionInput({ userId, refreshTokenFamilyId: familyId })
      );

      await repository.revokeById(session._id.toString());

      const found = await repository.findByFamilyId(userId, 'user', familyId);
      expect(found).toBeNull();
    });
  });

  describe('revokeById', () => {
    it('revokes a session and returns true', async () => {
      const session = await repository.create(makeSessionInput());

      const result = await repository.revokeById(session._id.toString());

      expect(result).toBe(true);
    });

    it('sets revokedAt on the session document', async () => {
      const session = await repository.create(makeSessionInput());

      await repository.revokeById(session._id.toString());

      const doc = await database.collection('sessions').findOne({ _id: session._id });
      expect(doc?.['revokedAt']).toBeInstanceOf(Date);
    });

    it('returns false for a non-existent session id', async () => {
      const result = await repository.revokeById(new ObjectId().toString());
      expect(result).toBe(false);
    });

    it('returns false for an invalid ObjectId string', async () => {
      const result = await repository.revokeById('not-a-valid-id');
      expect(result).toBe(false);
    });
  });

  describe('findActiveByUserId', () => {
    it('returns only active (non-revoked) sessions', async () => {
      const userId = new ObjectId().toString();
      await repository.create(makeSessionInput({ userId, refreshTokenFamilyId: 'active-1' }));
      const toRevoke = await repository.create(
        makeSessionInput({ userId, refreshTokenFamilyId: 'revoked-1' })
      );
      await repository.revokeById(toRevoke._id.toString());

      const active = await repository.findActiveByUserId(userId, 'user');

      expect(active).toHaveLength(1);
      expect(active[0]?.refreshTokenFamilyId).toBe('active-1');
    });

    it('returns empty array when user has no sessions', async () => {
      const active = await repository.findActiveByUserId(new ObjectId().toString(), 'user');
      expect(active).toEqual([]);
    });
  });

  describe('revokeAllExcept', () => {
    it('revokes all sessions except the specified family', async () => {
      const userId = new ObjectId().toString();
      await repository.create(makeSessionInput({ userId, refreshTokenFamilyId: 'keep-me' }));
      await repository.create(makeSessionInput({ userId, refreshTokenFamilyId: 'revoke-me-1' }));
      await repository.create(makeSessionInput({ userId, refreshTokenFamilyId: 'revoke-me-2' }));

      const revokedCount = await repository.revokeAllExcept(userId, 'user', 'keep-me');

      expect(revokedCount).toBe(2);

      const active = await repository.findActiveByUserId(userId, 'user');
      expect(active).toHaveLength(1);
      expect(active[0]?.refreshTokenFamilyId).toBe('keep-me');
    });
  });
});
