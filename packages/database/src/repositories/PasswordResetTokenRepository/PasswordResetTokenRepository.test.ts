import { MongoClient, type Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { PasswordResetTokenRepository } from './PasswordResetTokenRepository';

describe('PasswordResetTokenRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: PasswordResetTokenRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_password_reset_test');
    repository = new PasswordResetTokenRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('password_reset_tokens').deleteMany({});
  });

  describe('create', () => {
    it('should create a token for a user', async () => {
      const userId = new ObjectId().toString();
      const expiresAt = new Date(Date.now() + 3600000);

      await repository.create(userId, 'secure-token-123', expiresAt);

      const doc = await database.collection('password_reset_tokens').findOne({ token: 'secure-token-123' });
      expect(doc).not.toBeNull();
      expect(doc?.['userId']?.toString()).toBe(userId);
      expect(doc?.['expiresAt']).toEqual(expiresAt);
    });
  });

  describe('findValidByToken', () => {
    it('should return userId when token is valid and not expired', async () => {
      const userId = new ObjectId().toString();
      const expiresAt = new Date(Date.now() + 3600000);
      await repository.create(userId, 'valid-token', expiresAt);

      const result = await repository.findValidByToken('valid-token');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
    });

    it('should return null when token is expired', async () => {
      const userId = new ObjectId().toString();
      const expiresAt = new Date(Date.now() - 1000);
      await database.collection('password_reset_tokens').insertOne({
        userId: new ObjectId(userId),
        token: 'expired-token',
        expiresAt,
        createdAt: new Date(),
      });

      const result = await repository.findValidByToken('expired-token');

      expect(result).toBeNull();
    });

    it('should return null when token does not exist', async () => {
      const result = await repository.findValidByToken('nonexistent-token');
      expect(result).toBeNull();
    });
  });

  describe('invalidateForUser', () => {
    it('should delete all tokens for the user', async () => {
      const userId = new ObjectId().toString();
      await repository.create(userId, 'token-1', new Date(Date.now() + 3600000));
      await repository.create(userId, 'token-2', new Date(Date.now() + 3600000));

      await repository.invalidateForUser(userId);

      const count = await database.collection('password_reset_tokens').countDocuments({ userId: new ObjectId(userId) });
      expect(count).toBe(0);
    });

    it('should not affect tokens of other users', async () => {
      const user1 = new ObjectId().toString();
      const user2 = new ObjectId().toString();
      await repository.create(user1, 'token-1', new Date(Date.now() + 3600000));
      await repository.create(user2, 'token-2', new Date(Date.now() + 3600000));

      await repository.invalidateForUser(user1);

      const result = await repository.findValidByToken('token-2');
      expect(result?.userId).toBe(user2);
    });
  });
});
