/**
 * What the Noctusoft relay answers to `POST /sms/send`, and what this client makes of it.
 * The shapes are the relay's own (noctusoft-relay `sms-routes.js`):
 *
 * - sent:      201 `{ success: true, message: { twilio_sid, to, from, body, status } }`
 * - captured:  201 `{ success: true, captured: true, message: { to, body, status: 'captured' } }`
 * - refused:   4xx/5xx `{ error: true, code, message, status }`
 *
 * `fetch` is faked, so no text leaves the machine.
 */

import { SMS_RELAY_SEND_URL } from '@scholaracle/contracts';
import { NoctusoftSmsRelayClient, SmsRelayError } from './NoctusoftSmsRelayClient';

const PHONE = '+15125550100';

interface IFakeAnswer {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

function relayAnswers(answer: IFakeAnswer): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: answer.status >= 200 && answer.status < 300,
    status: answer.status,
    headers: { get: (name: string) => answer.headers?.[name.toLowerCase()] ?? null },
    text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
  });
}

function sentRequest(fetchMock: jest.Mock): { url: string; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
  return { url, headers: init.headers };
}

async function refusal(promise: Promise<unknown>): Promise<SmsRelayError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SmsRelayError) return error;
    throw error;
  }
  throw new Error('the relay client did not refuse');
}

describe('NoctusoftSmsRelayClient', () => {
  it("keeps Twilio's id for the text, which is where the relay puts it", async () => {
    const fetchMock = relayAnswers({
      status: 201,
      body: {
        success: true,
        message: { twilio_sid: 'SM0123456789', to: PHONE, body: 'Hello', status: 'queued' },
      },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const result = await client.send(PHONE, 'Hello');

    expect(result).toEqual({ messageSid: 'SM0123456789', captured: false });
  });

  it.each([
    ['at the top as sid', { success: true, sid: 'SMolder' }, 'SMolder'],
    ['at the top as messageSid', { success: true, messageSid: 'SMoldest' }, 'SMoldest'],
    [
      'at the top, when the place it belongs is empty',
      { success: true, message: { twilio_sid: '' }, sid: 'SMolder' },
      'SMolder',
    ],
  ])('still reads the id from an older answer that has it %s', async (_where, body, sid) => {
    const fetchMock = relayAnswers({ status: 201, body });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    expect(await client.send(PHONE, 'Hello')).toEqual({ messageSid: sid, captured: false });
  });

  it('an answer without an id is a text without one, not one with an empty id', async () => {
    const fetchMock = relayAnswers({
      status: 201,
      body: { success: true, message: { twilio_sid: '' }, sid: '' },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    expect(await client.send(PHONE, 'Hello')).toEqual({ captured: false });
  });

  it('asks with the product key as a bearer token, and sends the number and the text', async () => {
    const fetchMock = relayAnswers({ status: 201, body: { success: true, message: {} } });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    await client.send(PHONE, 'Hello');

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer nsk_test');
    expect(JSON.parse(init.body)).toEqual({ to: PHONE, body: 'Hello' });
  });

  it('says which environment the text comes from, and that is dev unless told otherwise', async () => {
    const production = relayAnswers({ status: 201, body: { success: true, message: {} } });
    await new NoctusoftSmsRelayClient('nsk_test', {
      appEnv: 'production',
      fetchFn: production,
    }).send(PHONE, 'Hello');
    expect(sentRequest(production).url).toBe(SMS_RELAY_SEND_URL);
    expect(sentRequest(production).headers['X-App-Env']).toBe('production');

    const unspecified = relayAnswers({ status: 201, body: { success: true, captured: true } });
    await new NoctusoftSmsRelayClient('nsk_test', { fetchFn: unspecified }).send(PHONE, 'Hello');
    expect(sentRequest(unspecified).headers['X-App-Env']).toBe('dev');
  });

  it('a text the relay captured was not sent, and has no id', async () => {
    const fetchMock = relayAnswers({
      status: 201,
      body: {
        success: true,
        captured: true,
        message: { to: PHONE, body: 'Hello', status: 'captured' },
      },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { appEnv: 'dev', fetchFn: fetchMock });

    const result = await client.send(PHONE, 'Hello');

    expect(result).toEqual({ captured: true });
  });

  it("a refusal carries the HTTP status and the relay's code, and none of its wording", async () => {
    const fetchMock = relayAnswers({
      status: 400,
      body: {
        error: true,
        code: 21610,
        message: `${PHONE} has opted out of texts from this sender`,
        status: 400,
      },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const error = await refusal(client.send(PHONE, 'Hello'));

    expect(error.status).toBe(400);
    expect(error.code).toBe(21610);
    // The relay's sentence can name the number: it must not travel with the error.
    const carried = JSON.stringify([error.message, String(error.stack), { ...error }]);
    expect(carried).not.toContain('5125550100');
    expect(carried).not.toContain('opted out');
  });

  it('keeps a code the relay gives as a word', async () => {
    const fetchMock = relayAnswers({
      status: 403,
      body: { error: true, code: 'SCOPE_FORBIDDEN', message: 'Key lacks the sms scope' },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const error = await refusal(client.send(PHONE, 'Hello'));

    expect(error.status).toBe(403);
    expect(error.code).toBe('SCOPE_FORBIDDEN');
  });

  it('reads how long the relay asks to wait when it limits the rate', async () => {
    const fetchMock = relayAnswers({
      status: 429,
      body: { error: true, code: 20429, message: 'Too many texts', status: 429 },
      headers: { 'retry-after': '1800' },
    });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const error = await refusal(client.send(PHONE, 'Hello'));

    expect(error.status).toBe(429);
    expect(error.code).toBe(20429);
    expect(error.retryAfterSeconds).toBe(1800);
  });

  it('an answer that is not JSON is a refusal with its status and no code', async () => {
    const fetchMock = relayAnswers({ status: 502, body: '<html>Bad Gateway</html>' });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const error = await refusal(client.send(PHONE, 'Hello'));

    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
  });

  it('no answer at all is status 0, without the reason the connection gave', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error(`connect ECONNREFUSED while texting ${PHONE}`));
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock });

    const error = await refusal(client.send(PHONE, 'Hello'));

    expect(error.status).toBe(0);
    expect(error.message).not.toContain('5125550100');
  });

  it('gives up on a relay that does not answer in time', async () => {
    const fetchMock = relayAnswers({ status: 201, body: { success: true, message: {} } });
    const client = new NoctusoftSmsRelayClient('nsk_test', { fetchFn: fetchMock, timeoutMs: 5000 });

    await client.send(PHONE, 'Hello');

    const [, init] = fetchMock.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
