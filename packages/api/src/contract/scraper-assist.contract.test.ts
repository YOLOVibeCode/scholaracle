/**
 * Contract pin for scholaracle_scrapers `src/ai/client.ts` request/response shape.
 */
import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import { createScraperAssistRouter } from '../routes/ingest/v1/scraperAssist';
import { createErrorHandler } from '../middleware/errorHandler';
import { assertKeys } from './assertExactKeys';
import { seedActiveConnectorJti } from '../testHelpers/connectorDeviceTestSeed';

jest.mock('@scholaracle/agents', () => ({
  LlmClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: '--- scraper.ts ---\nexport class Scraper {}',
      usage: { inputTokens: 10, outputTokens: 20 },
    }),
  })),
  resolveLlmConfig: jest.fn(() => ({
    apiKey: 'test-key',
    baseUrl: 'https://relay.test',
    model: 'test-model',
  })),
}));

describe('scraper-assist API contract (CLI client)', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: express.Express;
  let connectorToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('scraper_assist_contract');
    const jwtSecret = 'contract-jwt-secret-minimum-32-chars';
    app = express();
    app.use('/api/ingest/v1/ai', createScraperAssistRouter({ database, jwtSecret }));
    app.use(createErrorHandler());
    const tokenService = new ConnectorTokenService(jwtSecret);
    connectorToken = tokenService.createToken(
      'contract-cli-user',
      'jti-cli-contract',
      'device-cli-contract'
    );
    await seedActiveConnectorJti(
      database,
      'contract-cli-user',
      'device-cli-contract',
      'jti-cli-contract'
    );
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('POST /api/ingest/v1/ai/scraper-assist — scholaracle_scrapers client body', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/ai/scraper-assist')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        purpose: 'generate',
        system: 'client-supplied system (ignored)',
        prompt: 'Generate a Playwright scraper for Example ISD Canvas.',
        maxTokens: 8000,
      });

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['purpose', 'content', 'usage'],
      [],
      'IScraperAssistResponse'
    );
    expect(res.body.purpose).toBe('generate');
    expect(typeof res.body.content).toBe('string');
  });
});
