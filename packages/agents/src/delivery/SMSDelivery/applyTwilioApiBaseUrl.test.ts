import { applyTwilioApiBaseUrl } from './applyTwilioApiBaseUrl';
import type { Twilio } from 'twilio';

function makeFakeClient(): Twilio {
  return { api: { baseUrl: 'https://api.twilio.com' } } as unknown as Twilio;
}

describe('applyTwilioApiBaseUrl', () => {
  it('overrides the api domain base URL when provided', () => {
    const client = makeFakeClient();

    const result = applyTwilioApiBaseUrl(client, 'https://api.twilio.noctusoft.com');

    expect((result as unknown as { api: { baseUrl: string } }).api.baseUrl).toBe(
      'https://api.twilio.noctusoft.com'
    );
  });

  it('strips a trailing slash from the override', () => {
    const client = makeFakeClient();

    applyTwilioApiBaseUrl(client, 'https://api.twilio.noctusoft.com/');

    expect((client as unknown as { api: { baseUrl: string } }).api.baseUrl).toBe(
      'https://api.twilio.noctusoft.com'
    );
  });

  it('leaves the client untouched when no override is provided', () => {
    const client = makeFakeClient();

    applyTwilioApiBaseUrl(client, undefined);

    expect((client as unknown as { api: { baseUrl: string } }).api.baseUrl).toBe(
      'https://api.twilio.com'
    );
  });

  it('returns the same client instance for chaining', () => {
    const client = makeFakeClient();

    expect(applyTwilioApiBaseUrl(client, 'https://relay.example.com')).toBe(client);
  });
});
