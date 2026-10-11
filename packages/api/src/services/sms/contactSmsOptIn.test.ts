import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SCHOLARMANCY_SMS_PURPOSE, SMS_OPT_IN_TEXT_VERSION } from '@scholaracle/contracts';
import { SmsConsentRepository, SmsContactOptInInviteRepository } from '@scholaracle/database';
import { createContactSmsOptIn } from './contactSmsOptIn';

describe('contact SMS self opt-in', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('contact_sms_optin_test');
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('sms_consents').deleteMany({});
    await database.collection('sms_contact_optin_invites').deleteMany({});
  });

  const optIn = (): ReturnType<typeof createContactSmsOptIn> =>
    createContactSmsOptIn(database, 'https://scholarmancy.com');

  it('issues a link only when the contact gets texts', async () => {
    const service = optIn();
    const emailOnly = await service.issueIfTexting({
      studentId: 's1',
      contactEmail: 'a@example.com',
      inviterName: 'Alex',
      alertChannels: ['email'],
    });
    expect(emailOnly).toBeUndefined();
    const url = await service.issueIfTexting({
      studentId: 's1',
      contactEmail: 'a@example.com',
      inviterName: 'Alex',
      phone: '(512) 555-0100',
      alertChannels: ['email', 'sms'],
    });
    expect(url).toMatch(/^https:\/\/scholarmancy\.com\/sms\/optin\/[a-f0-9]{48}$/);
    const invite = await new SmsContactOptInInviteRepository(database).findLatestForContact(
      's1',
      'a@example.com'
    );
    expect(invite?.phoneE164).toBe('+15125550100');
  });

  it('reports none, invited, opted_in and opted_out', async () => {
    const service = optIn();
    const contact = {
      email: 'b@example.com',
      phone: '512-555-0101',
      alertChannels: ['sms'] as const,
    };
    expect(await service.statusFor('s1', contact)).toBe('none');
    await service.issueIfTexting({
      studentId: 's1',
      contactEmail: 'b@example.com',
      inviterName: 'Alex',
      phone: contact.phone,
      alertChannels: ['sms'],
    });
    expect(await service.statusFor('s1', contact)).toBe('invited');
    const consents = new SmsConsentRepository(database);
    await consents.recordOptIn({
      phoneE164: '+15125550101',
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/sms/optin',
    });
    expect(await service.statusFor('s1', contact)).toBe('opted_in');
    await consents.recordOptOut('+15125550101', SCHOLARMANCY_SMS_PURPOSE);
    expect(await service.statusFor('s1', contact)).toBe('opted_out');
  });

  it('uses the number the contact consented with when the parent gave none', async () => {
    const service = optIn();
    const url = await service.issueIfTexting({
      studentId: 's1',
      contactEmail: 'c@example.com',
      inviterName: 'Alex',
      alertChannels: ['sms'],
    });
    const token = url!.split('/').pop()!;
    await new SmsContactOptInInviteRepository(database).markUsed(token, '+15125550102');
    await new SmsConsentRepository(database).recordOptIn({
      phoneE164: '+15125550102',
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/sms/optin',
    });
    expect(await service.statusFor('s1', { email: 'c@example.com', alertChannels: ['sms'] })).toBe(
      'opted_in'
    );
  });
});
