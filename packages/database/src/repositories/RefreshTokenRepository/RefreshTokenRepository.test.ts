import { MongoClient, ObjectId, type Db } from 'mongodb';
import { RefreshTokenRepository } from './RefreshTokenRepository';

describe('RefreshTokenRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: RefreshTokenRepository;
  const userIds: ObjectId[] = [];

  const newUserId = (): string => {
    const id = new ObjectId();
    userIds.push(id);
    return id.toString();
  };

  const inThirtyDays = (): Date => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  /** Is the token still one a device could refresh with? */
  const works = async (tokenHash: string): Promise<boolean> =>
    (await repository.findValidByTokenHash(tokenHash)) !== null;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new RefreshTokenRepository(database);
  });

  afterAll(async () => {
    await database.collection('refresh_tokens').deleteMany({ userId: { $in: userIds } });
    await client.close();
  });

  describe('revokeFamily', () => {
    it('ends every token of the family and no other', async () => {
      const userId = newUserId();
      await repository.create(userId, 'rf-family-a-1', 'rf-family-a', inThirtyDays());
      await repository.create(userId, 'rf-family-a-2', 'rf-family-a', inThirtyDays());
      await repository.create(userId, 'rf-family-b-1', 'rf-family-b', inThirtyDays());

      await repository.revokeFamily('rf-family-a');

      expect(await works('rf-family-a-1')).toBe(false);
      expect(await works('rf-family-a-2')).toBe(false);
      expect(await works('rf-family-b-1')).toBe(true);
    });
  });

  describe('revokeAllForUserExcept', () => {
    it('ends every other family of the user and keeps the one named', async () => {
      const userId = newUserId();
      await repository.create(userId, 'ro-keep-1', 'ro-keep', inThirtyDays());
      await repository.create(userId, 'ro-other-1', 'ro-other', inThirtyDays());
      await repository.create(userId, 'ro-third-1', 'ro-third', inThirtyDays());

      const ended = await repository.revokeAllForUserExcept(userId, 'ro-keep');

      expect(ended).toBe(2);
      expect(await works('ro-keep-1')).toBe(true);
      expect(await works('ro-other-1')).toBe(false);
      expect(await works('ro-third-1')).toBe(false);
    });

    it("leaves another user's tokens alone", async () => {
      const userId = newUserId();
      const someoneElse = newUserId();
      await repository.create(userId, 'ru-mine-1', 'ru-mine', inThirtyDays());
      await repository.create(someoneElse, 'ru-theirs-1', 'ru-theirs', inThirtyDays());

      await repository.revokeAllForUserExcept(userId, 'ru-keep-nothing');

      expect(await works('ru-mine-1')).toBe(false);
      expect(await works('ru-theirs-1')).toBe(true);
    });

    it('counts only tokens it ended, not ones that were ended before', async () => {
      const userId = newUserId();
      await repository.create(userId, 'rc-old-1', 'rc-old', inThirtyDays());
      await repository.revokeFamily('rc-old');
      await repository.create(userId, 'rc-new-1', 'rc-new', inThirtyDays());

      expect(await repository.revokeAllForUserExcept(userId, 'rc-keep')).toBe(1);
      expect(await repository.revokeAllForUserExcept(userId, 'rc-keep')).toBe(0);
    });
  });
});
