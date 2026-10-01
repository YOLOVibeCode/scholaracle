import { SMS_RELAY_SEND_URL, TWILIO_OPT_OUT_ERROR_CODE } from '@scholaracle/contracts';

export interface INoctusoftSmsRelayResult {
  readonly messageSid: string;
}

export interface INoctusoftSmsRelayError {
  readonly code: number;
  readonly message: string;
}

/**
 * POST /sms/send on the Noctusoft Twilio relay (no Twilio SDK).
 */
export class NoctusoftSmsRelayClient {
  constructor(
    private readonly _apiKey: string,
    private readonly _fetchFn: typeof fetch = fetch
  ) {}

  public async send(to: string, body: string): Promise<INoctusoftSmsRelayResult> {
    const res = await this._fetchFn(SMS_RELAY_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, body }),
    });
    const text = await res.text();
    let payload: { error?: boolean; code?: number; message?: string; sid?: string } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = {};
    }
    if (!res.ok) {
      const code = typeof payload.code === 'number' ? payload.code : res.status;
      const message =
        typeof payload.message === 'string' ? payload.message : `SMS relay failed (${res.status})`;
      throw Object.assign(new Error(message), {
        code,
        isOptOut: code === TWILIO_OPT_OUT_ERROR_CODE,
      });
    }
    const sid =
      typeof payload.sid === 'string'
        ? payload.sid
        : typeof (payload as { messageSid?: string }).messageSid === 'string'
          ? (payload as { messageSid: string }).messageSid
          : '';
    return { messageSid: sid || 'unknown' };
  }
}
