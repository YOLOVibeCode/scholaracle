import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SERVER_AI_CONSENT_PURPOSE, SERVER_AI_CONSENT_TEXT_VERSION } from '@scholaracle/contracts';
import { ServerAiConsentRepository } from './ServerAiConsentRepository';

describe('ServerAiConsentRepository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: ServerAiConsentRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('server_ai_consent_test');
    repo = new ServerAiConsentRepository(database);
    await repo.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('consents').deleteMany({});
  });

  it('defaults to no active consent', async () => {
    const isActive = await repo.hasActiveConsent('user-1', SERVER_AI_CONSENT_PURPOSE);
    expect(isActive).toBe(false);
  });

  it('records opt-in and reports active consent', async () => {
    await repo.recordOptIn({
      userId: 'user-1',
      purpose: SERVER_AI_CONSENT_PURPOSE,
      consentTextVersion: SERVER_AI_CONSENT_TEXT_VERSION,
      source: '/dashboard/settings',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(await repo.hasActiveConsent('user-1', SERVER_AI_CONSENT_PURPOSE)).toBe(true);
  });

  it('records revoke and clears active consent', async () => {
    await repo.recordOptIn({
      userId: 'user-1',
      purpose: SERVER_AI_CONSENT_PURPOSE,
      consentTextVersion: SERVER_AI_CONSENT_TEXT_VERSION,
      source: '/dashboard/settings',
    });
    await repo.recordRevoke('user-1', SERVER_AI_CONSENT_PURPOSE);
    expect(await repo.hasActiveConsent('user-1', SERVER_AI_CONSENT_PURPOSE)).toBe(false);
  });
});
