import { MongoClient, type Db } from 'mongodb';
import { AiUsageRepository } from './AiUsageRepository';

describe('AiUsageRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: AiUsageRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new AiUsageRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('ai_usage').deleteMany({});
  });

  describe('record', () => {
    it('inserts a usage record into the collection', async () => {
      await repository.record('user-1', 'agenda');

      const docs = await database.collection('ai_usage').find({}).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0]?.['userId']).toBe('user-1');
      expect(docs[0]?.['feature']).toBe('agenda');
      expect(docs[0]?.['at']).toBeInstanceOf(Date);
    });

    it('records with a custom timestamp', async () => {
      const customDate = new Date('2025-06-15T12:00:00Z');
      await repository.record('user-2', 'scraper_generation', customDate);

      const doc = await database.collection('ai_usage').findOne({ userId: 'user-2' });
      expect(doc).toBeTruthy();
      expect(doc?.['at'].getTime()).toBe(customDate.getTime());
    });

    it('inserts multiple records for the same user and feature', async () => {
      await repository.record('user-3', 'grade_risk');
      await repository.record('user-3', 'grade_risk');
      await repository.record('user-3', 'grade_risk');

      const count = await database.collection('ai_usage').countDocuments({ userId: 'user-3' });
      expect(count).toBe(3);
    });
  });

  describe('countInWindow', () => {
    it('returns 0 when no records exist', async () => {
      const count = await repository.countInWindow('user-1', 'agenda', new Date('2025-01-01'));
      expect(count).toBe(0);
    });

    it('counts records at or after windowStart', async () => {
      const windowStart = new Date('2025-06-01T00:00:00Z');
      await repository.record('user-1', 'agenda', new Date('2025-05-31T23:59:59Z'));
      await repository.record('user-1', 'agenda', new Date('2025-06-01T00:00:00Z'));
      await repository.record('user-1', 'agenda', new Date('2025-06-15T12:00:00Z'));

      const count = await repository.countInWindow('user-1', 'agenda', windowStart);
      expect(count).toBe(2);
    });

    it('only counts matching user and feature', async () => {
      const windowStart = new Date('2025-01-01T00:00:00Z');
      await repository.record('user-A', 'agenda', new Date('2025-06-01'));
      await repository.record('user-B', 'agenda', new Date('2025-06-01'));
      await repository.record('user-A', 'grade_risk', new Date('2025-06-01'));

      const count = await repository.countInWindow('user-A', 'agenda', windowStart);
      expect(count).toBe(1);
    });

    it('includes records exactly at the window boundary', async () => {
      const boundary = new Date('2025-06-01T00:00:00Z');
      await repository.record('user-1', 'scraper_generation', boundary);

      const count = await repository.countInWindow('user-1', 'scraper_generation', boundary);
      expect(count).toBe(1);
    });
  });
});
