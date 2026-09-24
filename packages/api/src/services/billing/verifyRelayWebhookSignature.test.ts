import crypto from 'crypto';
import { verifyRelayWebhookSignature } from './verifyRelayWebhookSignature';

describe('verifyRelayWebhookSignature', () => {
  const secret = 'whsec_test';
  const rawBody = '{"id":"evt_1"}';
  const callbackUrl = 'https://api.example.com/api/webhooks/relay';

  it('accepts x-relay-signature', () => {
    const sig = crypto
      .createHmac('sha256', secret)
      .update(callbackUrl + rawBody)
      .digest('base64');
    const isValid = verifyRelayWebhookSignature({
      rawBody,
      relaySignature: sig,
      webhookSecret: secret,
      callbackUrl,
    });
    expect(isValid).toBe(true);
  });

  it('accepts x-noctusoft-signature', () => {
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const isValid = verifyRelayWebhookSignature({
      rawBody,
      noctusoftSignature: sig,
      webhookSecret: secret,
      callbackUrl,
    });
    expect(isValid).toBe(true);
  });

  it('rejects invalid signature', () => {
    const isValid = verifyRelayWebhookSignature({
      rawBody,
      relaySignature: 'bad',
      webhookSecret: secret,
      callbackUrl,
    });
    expect(isValid).toBe(false);
  });
});
