import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SCHOLARMANCY_SMS_PURPOSE, SMS_OPT_IN_TEXT_VERSION } from '@scholaracle/contracts';
import { SmsConsentRepository } from '@scholaracle/database';
import { createSmsStack, describeSmsStack } from './createSmsStack';

/**
 * The stack is what the API and the workers build at start. These tests send one text
 * through all of it against a faked `fetch`, to see what the relay would be told.
 */
describe('createSmsStack', () => {
  const PHONE = '+15125550100';
  const realFetch = globalThis.fetch;
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = new MongoClient(mongo.getUri());
    await client.connect();
    db = client.db('create_sms_stack_test');
    await new SmsConsentRepository(db).recordOptIn({
      phoneE164: PHONE,
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/register',
    });
  });

  afterAll(async () => {
    await client.close();
    await mongo.stop();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function relayAccepts(): jest.Mock {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => null },
      text: async () => JSON.stringify({ success: true, message: { twilio_sid: 'SMstack' } }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  function appEnvSent(fetchMock: jest.Mock): string | undefined {
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    return init.headers['X-App-Env'];
  }

  it('is not built without a key: texts are off', () => {
    expect(createSmsStack(db, undefined, {})).toBeNull();
    expect(createSmsStack(db, '', { RAILWAY_ENVIRONMENT_NAME: 'production' })).toBeNull();
  });

  it('reads the key from NOCTUSOFT_API_KEY', () => {
    expect(createSmsStack(db, undefined, { NOCTUSOFT_API_KEY: 'nsk_test' })).not.toBeNull();
  });

  it('sends real texts from the production environment', async () => {
    const fetchMock = relayAccepts();
    const stack = createSmsStack(db, 'nsk_test', { RAILWAY_ENVIRONMENT_NAME: 'production' });

    expect(stack?.appEnv).toBe('production');
    await stack?.guardedSender.sendTransactional(PHONE, 'Hello', { userId: 'account-1' });

    expect(appEnvSent(fetchMock)).toBe('production');
  });

  it('has the relay capture every text from anywhere else', async () => {
    const fetchMock = relayAccepts();
    const stack = createSmsStack(db, 'nsk_test', { RAILWAY_ENVIRONMENT_NAME: 'dev' });

    expect(stack?.appEnv).toBe('dev');
    await stack?.guardedSender.sendTransactional(PHONE, 'Hello', { userId: 'account-1' });

    expect(appEnvSent(fetchMock)).toBe('dev');
  });

  describe('what a service says about texts when it starts', () => {
    it('that they are off, without a key', () => {
      expect(describeSmsStack(createSmsStack(db, undefined, {}))).toEqual({
        texts: 'off',
        message: 'texts are off: NOCTUSOFT_API_KEY is not set',
      });
    });

    it('that the relay captures them, outside production', () => {
      const stack = createSmsStack(db, 'nsk_test', { RAILWAY_ENVIRONMENT_NAME: 'dev' });

      expect(describeSmsStack(stack)).toEqual({
        texts: 'dev',
        message: 'texts are on: the relay captures them, none is sent',
      });
    });

    it.each([
      ['production', { RAILWAY_ENVIRONMENT_NAME: 'production' }],
      ['uat', { SMS_APP_ENV: 'uat' }],
    ] as const)('that they are sent, in %s', (texts, env) => {
      expect(describeSmsStack(createSmsStack(db, 'nsk_test', env))).toEqual({
        texts,
        message: 'texts are on: they are sent',
      });
    });

    it('never the key', () => {
      const stack = createSmsStack(db, 'nsk_never_print_me', {
        RAILWAY_ENVIRONMENT_NAME: 'production',
      });

      expect(JSON.stringify(describeSmsStack(stack))).not.toContain('nsk_never_print_me');
    });
  });
});
