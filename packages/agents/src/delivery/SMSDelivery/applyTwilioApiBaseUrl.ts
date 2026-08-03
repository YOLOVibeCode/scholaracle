import type { Twilio } from 'twilio';

/**
 * Point a Twilio client's REST API domain at an alternative base URL, e.g. a
 * Twilio-compatible relay such as the Noctusoft gateway. No-op when baseUrl is
 * unset, so callers can pass the raw env value. Returns the client for chaining.
 */
export function applyTwilioApiBaseUrl(client: Twilio, baseUrl?: string): Twilio {
  if (baseUrl) {
    (client as unknown as { api: { baseUrl: string } }).api.baseUrl = baseUrl.replace(/\/+$/, '');
  }
  return client;
}
