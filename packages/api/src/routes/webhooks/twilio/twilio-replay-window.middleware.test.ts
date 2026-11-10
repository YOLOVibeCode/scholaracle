import {
  resolveTwilioWebhookEventTimeMs,
  resolveTwilioWebhookMaxAgeMs,
} from './twilio-replay-window.middleware';

describe('twilio-replay-window.middleware', () => {
  const originalEnv = process.env['TWILIO_WEBHOOK_MAX_AGE_MS'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['TWILIO_WEBHOOK_MAX_AGE_MS'];
    } else {
      process.env['TWILIO_WEBHOOK_MAX_AGE_MS'] = originalEnv;
    }
  });

  it('parses Timestamp as Unix seconds', () => {
    const ms = resolveTwilioWebhookEventTimeMs({ Timestamp: '1609459200' });
    expect(ms).toBe(1609459200 * 1000);
  });

  it('ignores the carrier RawDlrDoneDate (late, zone-less) and uses server time', () => {
    jest.spyOn(Date, 'now').mockReturnValue(42);
    expect(resolveTwilioWebhookEventTimeMs({ RawDlrDoneDate: '2006100112' })).toBe(42);
    jest.restoreAllMocks();
  });

  it('uses server time when body has no event time', () => {
    jest.spyOn(Date, 'now').mockReturnValue(42);
    expect(resolveTwilioWebhookEventTimeMs({})).toBe(42);
    jest.restoreAllMocks();
  });

  it('reads TWILIO_WEBHOOK_MAX_AGE_MS when set', () => {
    process.env['TWILIO_WEBHOOK_MAX_AGE_MS'] = '120000';
    expect(resolveTwilioWebhookMaxAgeMs()).toBe(120000);
  });

  it('falls back to five minutes when env is invalid', () => {
    process.env['TWILIO_WEBHOOK_MAX_AGE_MS'] = 'not-a-number';
    expect(resolveTwilioWebhookMaxAgeMs()).toBe(5 * 60 * 1000);
  });
});
