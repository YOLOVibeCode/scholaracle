import { MongoClient, ObjectId, type Db } from 'mongodb';
import { checkAiRateLimit, recordAiUsage, AI_RATE_LIMITS } from './ai-rate-limit';

describe('AI Rate Limit', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('subscriptions').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('ai_usage').deleteMany({});
  });

  it('premium user gets premium limits from subscription', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'user1',
      plan: 'premium',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const result = await checkAiRateLimit(database, 'user1', 'scraper_generation');

    expect(result).toEqual({
      allowed: true,
      limit: AI_RATE_LIMITS.premium.scraper_generation,
      used: 0,
    });
  });

  it('falls back to user doc when no subscription', async () => {
    const userId = new ObjectId();
    await database.collection('users').insertOne({
      _id: userId,
      email: 'test@test.com',
      name: 'Test',
      passwordHash: 'x',
      subscription: { plan: 'starter', status: 'active' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await checkAiRateLimit(database, userId.toHexString(), 'scraper_generation');

    expect(result).toEqual({
      allowed: true,
      limit: AI_RATE_LIMITS.starter.scraper_generation,
      used: 0,
    });
  });

  it('defaults to free when no subscription and no user', async () => {
    const nonExistentId = new ObjectId().toHexString();
    const result = await checkAiRateLimit(database, nonExistentId, 'scraper_generation');

    expect(result).toEqual({
      allowed: false,
      limit: 0,
      used: 0,
    });
  });

  it('enterprise user gets unlimited', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'ent_user',
      plan: 'enterprise',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const result = await checkAiRateLimit(database, 'ent_user', 'scraper_generation');

    expect(result).toEqual({
      allowed: true,
      limit: -1,
      used: 0,
    });
  });

  it('blocks after limit reached', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'limited_user',
      plan: 'starter',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    await recordAiUsage(database, 'limited_user', 'scraper_generation');
    await recordAiUsage(database, 'limited_user', 'scraper_generation');

    const result = await checkAiRateLimit(database, 'limited_user', 'scraper_generation');

    expect(result).toEqual({
      allowed: false,
      limit: AI_RATE_LIMITS.starter.scraper_generation,
      used: 2,
    });
  });

  it('recordAiUsage inserts into ai_usage collection', async () => {
    await recordAiUsage(database, 'record_user', 'scraper_generation');

    const entry = await database.collection('ai_usage').findOne({
      userId: 'record_user',
      feature: 'scraper_generation',
    });

    expect(entry).toBeTruthy();
    expect(entry!['userId']).toBe('record_user');
    expect(entry!['feature']).toBe('scraper_generation');
    expect(entry!['at']).toBeInstanceOf(Date);
  });
});
