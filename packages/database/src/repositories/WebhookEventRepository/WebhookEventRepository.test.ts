/**
 * Tests for WebhookEventRepository — DEFECTS.md DEF-001 + DEF-007.
 *
 * Provides idempotency for webhook delivery by recording (provider, eventId)
 * with TTL. Used by Square (and later Twilio) webhook handlers to reject
 * duplicate / replayed events.
 */
import { MongoClient, type Db } from 'mongodb';
import { WebhookEventRepository } from './WebhookEventRepository';

describe('WebhookEventRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: WebhookEventRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db(dbName);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('webhook_events').deleteMany({});
    repo = new WebhookEventRepository(database);
    await repo.ensureIndexes();
  });

  describe('recordIfNew', () => {
    it('returns true when the event is new', async () => {
      const isNew = await repo.recordIfNew('square', 'evt_a');
      expect(isNew).toBe(true);
    });

    it('returns false when the same (provider, eventId) is replayed', async () => {
      await repo.recordIfNew('square', 'evt_b');
      const isNewSecondTime = await repo.recordIfNew('square', 'evt_b');
      expect(isNewSecondTime).toBe(false);
    });

    it('treats different providers with the same eventId as distinct', async () => {
      const isFirst = await repo.recordIfNew('square', 'evt_shared');
      const isSecond = await repo.recordIfNew('twilio', 'evt_shared');
      expect(isFirst).toBe(true);
      expect(isSecond).toBe(true);
    });

    it('persists processedAt and an expiresAt for TTL cleanup', async () => {
      const before = Date.now();
      await repo.recordIfNew('square', 'evt_ttl');
      const after = Date.now();

      const doc = await database
        .collection('webhook_events')
        .findOne({ provider: 'square', eventId: 'evt_ttl' });
      expect(doc).toBeTruthy();
      const processedAt = (doc!['processedAt'] as Date).getTime();
      const expiresAt = (doc!['expiresAt'] as Date).getTime();
      expect(processedAt).toBeGreaterThanOrEqual(before);
      expect(processedAt).toBeLessThanOrEqual(after);
      expect(expiresAt).toBeGreaterThan(processedAt);
    });

    it('honours a caller-supplied ttlMs', async () => {
      const ttlMs = 60_000; // 1 minute
      await repo.recordIfNew('square', 'evt_short_ttl', ttlMs);
      const doc = await database
        .collection('webhook_events')
        .findOne({ provider: 'square', eventId: 'evt_short_ttl' });
      const processedAt = (doc!['processedAt'] as Date).getTime();
      const expiresAt = (doc!['expiresAt'] as Date).getTime();
      expect(expiresAt - processedAt).toBeGreaterThanOrEqual(ttlMs - 1);
      expect(expiresAt - processedAt).toBeLessThan(ttlMs + 5_000);
    });
  });

  describe('hasBeenSeen', () => {
    it('returns false for an unrecorded event', async () => {
      expect(await repo.hasBeenSeen('square', 'never_seen')).toBe(false);
    });

    it('returns true after recordIfNew', async () => {
      await repo.recordIfNew('square', 'evt_seen');
      expect(await repo.hasBeenSeen('square', 'evt_seen')).toBe(true);
    });
  });

  describe('ensureIndexes', () => {
    it('creates a unique compound index on (provider, eventId)', async () => {
      const indexes = await database.collection('webhook_events').indexes();
      const compound = indexes.find(
        (i) => i.key && i.key['provider'] === 1 && i.key['eventId'] === 1
      );
      expect(compound).toBeDefined();
      expect(compound!['unique']).toBe(true);
    });

    it('creates a TTL index on expiresAt', async () => {
      const indexes = await database.collection('webhook_events').indexes();
      const ttl = indexes.find((i) => i.key && i.key['expiresAt'] === 1);
      expect(ttl).toBeDefined();
      expect(typeof ttl!['expireAfterSeconds']).toBe('number');
    });
  });
});
