import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { requirePlan } from './subscriptionGuard';

describe('Subscription Guard', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  const testUserId = 'guard_test_user';

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const middleware = requirePlan('premium', { database });

    app = express();
    app.use(express.json());

    app.get(
      '/protected',
      (req, _res, next) => {
        (req as any).userId = testUserId;
        next();
      },
      middleware,
      (_req, res) => {
        res.json({ success: true });
      }
    );

    app.get('/protected-no-user', middleware, (_req, res) => {
      res.json({ success: true });
    });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('subscriptions').deleteMany({});
  });

  it('returns 401 when no userId', async () => {
    const res = await request(app).get('/protected-no-user');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/i);
  });

  it('returns 403 for free user on premium route', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
    expect(res.body.requiredPlan).toBe('premium');
    expect(res.body.currentPlan).toBe('free');
  });

  it('returns 403 for starter user on premium route', async () => {
    await database.collection('subscriptions').insertOne({
      userId: testUserId,
      plan: 'starter',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
    expect(res.body.requiredPlan).toBe('premium');
    expect(res.body.currentPlan).toBe('starter');
  });

  it('allows premium user on premium route', async () => {
    await database.collection('subscriptions').insertOne({
      userId: testUserId,
      plan: 'premium',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows enterprise user on premium route', async () => {
    await database.collection('subscriptions').insertOne({
      userId: testUserId,
      plan: 'enterprise',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('expired subscription treated as free', async () => {
    await database.collection('subscriptions').insertOne({
      userId: testUserId,
      plan: 'premium',
      status: 'expired',
      currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
    expect(res.body.currentPlan).toBe('free');
  });

  it('cancelled subscription treated as free', async () => {
    await database.collection('subscriptions').insertOne({
      userId: testUserId,
      plan: 'premium',
      status: 'cancelled',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 1),
      billingCycle: 'monthly',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const res = await request(app).get('/protected');

    expect(res.status).toBe(403);
    expect(res.body.currentPlan).toBe('free');
  });
});
