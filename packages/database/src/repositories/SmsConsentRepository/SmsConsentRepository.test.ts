import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SCHOLARMANCY_SMS_PURPOSE, SMS_OPT_IN_TEXT_VERSION } from '@scholaracle/contracts';
import { SmsConsentRepository } from './SmsConsentRepository';

describe('SmsConsentRepository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: SmsConsentRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('sms_consent_test');
    repo = new SmsConsentRepository(database);
    await repo.ensureIndexes();
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('sms_consents').deleteMany({});
  });

  it('records opt-in and reports active consent', async () => {
    await repo.recordOptIn({
      phoneE164: '+15125550100',
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/register',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
    const isActive = await repo.hasActiveConsent('+15125550100', SCHOLARMANCY_SMS_PURPOSE);
    expect(isActive).toBe(true);
  });

  it('records opt-out and clears active consent', async () => {
    await repo.recordOptIn({
      phoneE164: '+15125550100',
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/register',
    });
    await repo.recordOptOut('+15125550100', SCHOLARMANCY_SMS_PURPOSE);
    expect(await repo.hasActiveConsent('+15125550100', SCHOLARMANCY_SMS_PURPOSE)).toBe(false);
  });

  it('completeReplyYes grants consent for pending numbers', async () => {
    await repo.markConfirmationSent('+15125550101', SCHOLARMANCY_SMS_PURPOSE);
    await repo.completeReplyYes('+15125550101', SCHOLARMANCY_SMS_PURPOSE);
    expect(await repo.hasActiveConsent('+15125550101', SCHOLARMANCY_SMS_PURPOSE)).toBe(true);
    const row = await repo.findByPhoneAndPurpose('+15125550101', SCHOLARMANCY_SMS_PURPOSE);
    expect(row?.source).toBe('reply-yes');
  });
});
