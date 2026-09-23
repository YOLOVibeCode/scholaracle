import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createScraperAssistRouter } from './scraperAssist';
import { ConnectorTokenService } from '@scholaracle/auth';

jest.mock('@scholaracle/agents', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  })),
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
    connectorToken = tokenService.createToken('user-1', 'jti-test-1');
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
});
