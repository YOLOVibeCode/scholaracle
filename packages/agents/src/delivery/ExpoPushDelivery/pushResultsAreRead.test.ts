/**
 * Expo answers every push with one ticket per message. A ticket can say the push was refused,
 * and a refused push is not a delivered one.
 *
 * These tests run the real sender against a faked `fetch`, so they show what the workers
 * process does with each answer Expo documents:
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

import {
  AgentType,
  DeliveryError,
  Notification,
  NotificationChannel,
  NotificationPriority,
} from '@scholaracle/contracts';
import { logger } from '../../logger';
import { ExpoPushDelivery } from './ExpoPushDelivery';

const PHONE = 'ExponentPushToken[phone-one]';
const OLD_PHONE = 'ExponentPushToken[old-phone]';

/** What Expo says about a token whose app was removed or whose notifications are off. */
const NOT_REGISTERED = {
  status: 'error',
  message: `"${OLD_PHONE}" is not a registered push notification recipient`,
  details: { error: 'DeviceNotRegistered' },
};

function notification(): Notification {
  return new Notification({
    agentType: AgentType.STUDENT,
    studentId: 'student-1',
    userId: 'user-1',
    subject: 'Lab report is due tomorrow',
    body: 'Biology: Lab report',
    priority: NotificationPriority.HIGH,
    triggerType: 'guidance_reminder',
  });
}

function expoAnswers(status: number, body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function pushTo(tokens: readonly string[]): ExpoPushDelivery {
  return new ExpoPushDelivery({ tokenStore: { getTokens: async () => tokens } });
}

/** Everything written to the log, as one string. */
function logged(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('what Expo answers decides whether a push was delivered', () => {
  const realFetch = globalThis.fetch;
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('a push Expo accepts is delivered, and the log has nothing to add', async () => {
    const fetchMock = expoAnswers(200, { data: [{ status: 'ok', id: 'receipt-1' }] });

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result).toMatchObject({ success: true, channel: NotificationChannel.PUSH });
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    // One request, with the message Expo is to send.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual([
      expect.objectContaining({
        to: PHONE,
        title: 'Lab report is due tomorrow',
        body: 'Biology: Lab report',
      }),
    ]);
  });

  it('a push Expo refuses is not delivered, although the request itself succeeded', async () => {
    expoAnswers(200, { data: [NOT_REGISTERED] });

    const result = await pushTo([OLD_PHONE]).deliver(notification());

    expect(result).toMatchObject({ success: false, channel: NotificationChannel.PUSH });
    expect(result.messageId).toBeUndefined();
    expect(result.error).toBe('Expo did not accept the push: DeviceNotRegistered');
  });

  it('with one phone reached and one refused, the push is delivered and the log says so', async () => {
    expoAnswers(200, { data: [{ status: 'ok', id: 'receipt-1' }, NOT_REGISTERED] });

    const result = await pushTo([PHONE, OLD_PHONE]).deliver(notification());

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      { job: 'expo-push', phones: 2, refused: 1, reasons: ['DeviceNotRegistered'] },
      'push accepted for some of the phones'
    );
  });

  it('the order of the tickets is the order of the phones', async () => {
    expoAnswers(200, { data: [NOT_REGISTERED, { status: 'ok', id: 'receipt-2' }] });

    const result = await pushTo([OLD_PHONE, PHONE]).deliver(notification());

    expect(result.success).toBe(true);
    expect(info).toHaveBeenCalledWith(
      { job: 'expo-push', phones: 2, refused: 1, reasons: ['DeviceNotRegistered'] },
      'push accepted for some of the phones'
    );
  });

  it('a push refused for another reason is not delivered either', async () => {
    expoAnswers(200, {
      data: [{ status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }],
    });

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo did not accept the push: MessageTooBig');
  });

  it('names each reason once when several phones are refused', async () => {
    expoAnswers(200, {
      data: [
        NOT_REGISTERED,
        NOT_REGISTERED,
        { status: 'error', message: 'no details on this one' },
      ],
    });

    const result = await pushTo([OLD_PHONE, 'ExponentPushToken[older]', PHONE]).deliver(
      notification()
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo did not accept the push: DeviceNotRegistered, no reason given');
  });

  it('a phone Expo gave no answer for is not counted as reached', async () => {
    expoAnswers(200, { data: [{ status: 'ok', id: 'receipt-1' }] });

    const result = await pushTo([PHONE, OLD_PHONE]).deliver(notification());

    expect(result.success).toBe(true);
    expect(info).toHaveBeenCalledWith(
      { job: 'expo-push', phones: 2, refused: 1, reasons: ['no answer'] },
      'push accepted for some of the phones'
    );
  });

  it('no answer for the only phone is not a delivery', async () => {
    expoAnswers(200, { data: [] });

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo did not accept the push: no answer');
  });

  it('reads a single ticket that is not in a list', async () => {
    expoAnswers(200, { data: { status: 'ok', id: 'receipt-1' } });

    expect((await pushTo([PHONE]).deliver(notification())).success).toBe(true);
  });

  it.each([
    ['a reply with no tickets', {}, 'no answer'],
    ['a reply that is not an object', 'OK', 'no answer'],
    ['a ticket that is not an object', { data: ['ok'] }, 'no reason given'],
    ['a ticket with an unknown status', { data: [{ status: 'queued' }] }, 'no reason given'],
    [
      'a ticket whose reason is not a code',
      { data: [{ status: 'error', details: { error: `see ${PHONE}` } }] },
      'no reason given',
    ],
  ])('%s is not a delivery', async (_name, body, reason) => {
    expoAnswers(200, body);

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe(`Expo did not accept the push: ${reason}`);
  });

  it('nothing Expo says about a phone reaches the result or the log', async () => {
    expoAnswers(200, { data: [{ status: 'ok', id: 'receipt-1' }, NOT_REGISTERED] });
    const reached = await pushTo([PHONE, OLD_PHONE]).deliver(notification());
    expoAnswers(200, { data: [NOT_REGISTERED] });
    const refused = await pushTo([OLD_PHONE]).deliver(notification());

    const said = JSON.stringify([reached, refused]) + logged(info, warn);
    expect(info).toHaveBeenCalled();
    expect(said).not.toContain('old-phone');
    expect(said).not.toContain('phone-one');
    expect(said).not.toContain('ExponentPushToken');
    expect(said).not.toContain('Lab report');
  });
});

describe('a request Expo could not take is tried again', () => {
  const realFetch = globalThis.fetch;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  async function failure(push: ExpoPushDelivery): Promise<unknown> {
    try {
      await push.deliver(notification());
    } catch (err) {
      return err;
    }
    return undefined;
  }

  it.each([429, 500, 502, 503, 504])(
    'HTTP %i throws, so the queue keeps the job and retries it',
    async (status) => {
      expoAnswers(status, {
        errors: [{ code: 'TOO_MANY_REQUESTS', message: `slow down ${PHONE}` }],
      });

      const err = await failure(pushTo([PHONE, OLD_PHONE]));

      expect(err).toBeInstanceOf(DeliveryError);
      expect((err as DeliveryError).channel).toBe(NotificationChannel.PUSH);
      expect((err as DeliveryError).message).toBe(`Expo push not sent: http ${status}`);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        { job: 'expo-push', reason: `http ${status}`, phones: 2 },
        'push not sent; the queue retries it'
      );
    }
  );

  it('a request that never reached Expo throws, with the network code and nothing else', async () => {
    const down = new TypeError('fetch failed');
    (down as { cause?: unknown }).cause = { code: 'ECONNRESET', message: `socket to ${PHONE}` };
    globalThis.fetch = jest.fn().mockRejectedValue(down) as unknown as typeof fetch;

    const err = await failure(pushTo([PHONE]));

    expect(err).toBeInstanceOf(DeliveryError);
    expect((err as DeliveryError).message).toBe('Expo push not sent: network ECONNRESET');
    expect(logged(warn)).not.toContain('phone-one');
  });

  it.each([
    ['an error with no cause', new Error(`boom ${PHONE}`)],
    [
      'a cause whose code is not a code',
      Object.assign(new TypeError('fetch failed'), { cause: { code: `see ${PHONE}` } }),
    ],
    ['something that is not an error', `refused ${PHONE}`],
  ])('%s is still a network failure, and nothing of it is repeated', async (_name, thrown) => {
    globalThis.fetch = jest.fn().mockRejectedValue(thrown) as unknown as typeof fetch;

    const err = await failure(pushTo([PHONE]));

    expect(err).toBeInstanceOf(DeliveryError);
    expect((err as DeliveryError).message).toBe('Expo push not sent: network');
    expect(logged(warn)).not.toContain('phone-one');
  });

  it.each([
    [400, 'PUSH_TOO_MANY_EXPERIENCE_IDS'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
  ])('HTTP %i is not retried: the same request would be refused again', async (status, code) => {
    expoAnswers(status, { errors: [{ code, message: `details about ${PHONE}` }] });

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe(`Expo refused the request: http ${status} ${code}`);
    expect(JSON.stringify(result)).not.toContain('phone-one');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a code that is not a code', { errors: [{ code: `see ${PHONE}`, message: 'x' }] }],
    ['no list of errors', { errors: 'refused' }],
    ['an empty list of errors', { errors: [] }],
    ['an error that is not an object', { errors: ['refused'] }],
    ['no body', undefined],
  ])('a refusal with %s is reported by its status alone', async (_name, body) => {
    expoAnswers(400, body);

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo refused the request: http 400');
  });

  it('a refusal with a body that cannot be read is reported by its status alone', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.error).toBe('Expo refused the request: http 400');
  });

  it('an accepted request whose answer cannot be read is not sent a second time', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    }) as unknown as typeof fetch;

    const result = await pushTo([PHONE]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Expo did not accept the push: no answer');
  });

  it('a user with no phone is not sent anything and nothing is thrown', async () => {
    const fetchMock = expoAnswers(200, { data: [] });

    const result = await pushTo([]).deliver(notification());

    expect(result.success).toBe(false);
    expect(result.error).toBe('No Expo push tokens registered for user');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
