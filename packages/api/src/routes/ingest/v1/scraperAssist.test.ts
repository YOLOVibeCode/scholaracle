import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createScraperAssistRouter } from './scraperAssist';
import { ConnectorTokenService } from '@scholaracle/auth';
import { seedActiveConnectorJti } from '../../../testHelpers/connectorDeviceTestSeed';

jest.mock('@scholaracle/agents', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  })),
  resolveLlmConfig: jest.fn().mockImplementation(() =>
    process.env['LITELLM_API_KEY']
      ? {
          apiKey: process.env['LITELLM_API_KEY'],
          baseUrl: 'https://relay.test',
          model: 'test-model',
        }
      : null
  ),
}));

describe('POST /ai/scraper-assist', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: express.Express;
  let connectorToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('test');
    process.env['LITELLM_API_KEY'] = 'test-litellm';
    app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1/ai',
      createScraperAssistRouter({ database, jwtSecret: 'test-jwt-secret-min-32-chars!!' })
    );
    const tokenService = new ConnectorTokenService('test-jwt-secret-min-32-chars!!');
    connectorToken = tokenService.createToken('user-1', 'jti-test-1', 'assist-device');
    await seedActiveConnectorJti(database, 'user-1', 'assist-device', 'jti-test-1');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('rejects purposes other than generate or troubleshoot', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/ai/scraper-assist')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        purpose: 'summarize',
        messages: [{ role: 'user', content: 'hi' }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('accepts generate purpose', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/ai/scraper-assist')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        purpose: 'generate',
        messages: [{ role: 'user', content: 'build scraper' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('ok');
  });

  it('rejects requests larger than the input cap', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/ai/scraper-assist')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        purpose: 'generate',
        messages: [{ role: 'user', content: 'x'.repeat(200_001) }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('stops a user at the daily limit and keeps other users unaffected', async () => {
    const limitedApp = express();
    limitedApp.use(express.json());
    limitedApp.use(
      '/api/ingest/v1/ai',
      createScraperAssistRouter({
        database,
        jwtSecret: 'test-jwt-secret-min-32-chars!!',
        dailyLimit: 2,
        burstMax: 100,
      })
    );
    const tokenService = new ConnectorTokenService('test-jwt-secret-min-32-chars!!');
    const capped = tokenService.createToken('user-daily-cap', 'jti-daily-1', 'device-cap');
    const other = tokenService.createToken('user-daily-other', 'jti-daily-2', 'device-other');
    await seedActiveConnectorJti(database, 'user-daily-cap', 'device-cap', 'jti-daily-1');
    await seedActiveConnectorJti(database, 'user-daily-other', 'device-other', 'jti-daily-2');
    const call = (token: string) =>
      request(limitedApp)
        .post('/api/ingest/v1/ai/scraper-assist')
        .set('Authorization', `Bearer ${token}`)
        .send({ purpose: 'generate', messages: [{ role: 'user', content: 'go' }] });

    expect((await call(capped)).status).toBe(200);
    expect((await call(capped)).status).toBe(200);
    const blocked = await call(capped);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect((await call(other)).status).toBe(200);
  });

  it('limits bursts per user', async () => {
    const burstApp = express();
    burstApp.use(express.json());
    burstApp.use(
      '/api/ingest/v1/ai',
      createScraperAssistRouter({
        database,
        jwtSecret: 'test-jwt-secret-min-32-chars!!',
        dailyLimit: 100,
        burstMax: 1,
      })
    );
    const token = new ConnectorTokenService('test-jwt-secret-min-32-chars!!').createToken(
      'user-burst',
      'jti-burst-1',
      'device-burst'
    );
    await seedActiveConnectorJti(database, 'user-burst', 'device-burst', 'jti-burst-1');
    const call = () =>
      request(burstApp)
        .post('/api/ingest/v1/ai/scraper-assist')
        .set('Authorization', `Bearer ${token}`)
        .send({ purpose: 'troubleshoot', messages: [{ role: 'user', content: 'why' }] });

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });
});
