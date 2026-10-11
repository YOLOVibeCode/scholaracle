import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SCHOLARMANCY_SMS_PURPOSE,
  SMS_CONSENT_REQUIRED_MESSAGE,
  SMS_CONTACT_OPT_IN_SOURCE,
} from '@scholaracle/contracts';
import { SmsConsentRepository, SmsContactOptInInviteRepository } from '@scholaracle/database';
import { smsOptInRouter } from './smsOptIn';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('public SMS opt-in (/api/sms/optin)', () => {
  let app: Express;
  let database: Db;
  let client: MongoClient;
  let mongoServer: MongoMemoryServer;
  const sent: { to: string; body: string }[] = [];
  const studentId = new ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('sms_optin_router_test');
    const guardedSmsSender = {
      sendTransactional: jest.fn(async (to: string, body: string) => {
        sent.push({ to, body });
        return { messageId: 'SM1' };
      }),
    };
    app = express();
    app.use(express.json());
    app.use(
      '/api/sms/optin',
      smsOptInRouter({
        database,
        guardedSmsSender: guardedSmsSender as unknown as Parameters<
          typeof smsOptInRouter
        >[0]['guardedSmsSender'],
      })
    );
    app.use(createErrorHandler({ isProduction: false }));
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    sent.length = 0;
    await database.collection('sms_consents').deleteMany({});
    await database.collection('sms_contact_optin_invites').deleteMany({});
    await database.collection('students').deleteMany({});
    await database.collection('students').insertOne({
      _id: studentId,
      name: 'Emma',
      userId: new ObjectId(),
      sharedWith: [
        {
          email: 'coparent@example.com',
          role: 'parent',
          status: 'pending',
          invitedAt: new Date(),
          alertChannels: ['email', 'sms'],
        },
      ],
    });
  });

  async function issue(phoneE164?: string): Promise<string> {
    const invite = await new SmsContactOptInInviteRepository(database).issue({
      studentId: studentId.toString(),
      contactEmail: 'coparent@example.com',
      inviterName: 'Alex',
      ...(phoneE164 ? { phoneE164 } : {}),
    });
    return invite.token;
  }

  it('shows who invited them and the exact consent wording, without the number', async () => {
    const token = await issue('+15125550100');
    const res = await request(app).get(`/api/sms/optin/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.inviterName).toBe('Alex');
    expect(res.body.consentText).toContain('Text me grade and assignment alerts');
    expect(res.body.numberEnding).toBe('0100');
    expect(JSON.stringify(res.body)).not.toContain('5125550100');
  });

  it('404s for an unknown or used link', async () => {
    expect((await request(app).get('/api/sms/optin/unknown')).status).toBe(404);
  });

  it('refuses a number without the box checked and texts nobody', async () => {
    const token = await issue();
    const res = await request(app)
      .post(`/api/sms/optin/${token}`)
      .send({ phone: '512-555-0100', consent: false });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(SMS_CONSENT_REQUIRED_MESSAGE);
    const repo = new SmsConsentRepository(database);
    expect(await repo.hasActiveConsent('+15125550100', SCHOLARMANCY_SMS_PURPOSE)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('refuses a different number than the one the parent added', async () => {
    const token = await issue('+15125550100');
    const res = await request(app)
      .post(`/api/sms/optin/${token}`)
      .send({ phone: '512-555-0199', consent: true });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('records consent, saves the number on the contact, and sends one confirmation', async () => {
    const token = await issue();
    const res = await request(app)
      .post(`/api/sms/optin/${token}`)
      .set('User-Agent', 'jest-agent')
      .send({ phone: '(512) 555-0100', consent: true });
    expect(res.status).toBe(200);
    const row = await new SmsConsentRepository(database).findByPhoneAndPurpose(
      '+15125550100',
      SCHOLARMANCY_SMS_PURPOSE
    );
    expect(row?.consentedAt).toBeInstanceOf(Date);
    expect(row?.source).toBe(SMS_CONTACT_OPT_IN_SOURCE);
    expect(row?.userAgent).toBe('jest-agent');
    const student = await database.collection('students').findOne({ _id: studentId });
    expect(student?.['sharedWith'][0].phone).toBe('+15125550100');
    expect(sent).toEqual([{ to: '+15125550100', body: expect.stringContaining('opted in') }]);
    expect((await request(app).get(`/api/sms/optin/${token}`)).status).toBe(404);
  });
});
