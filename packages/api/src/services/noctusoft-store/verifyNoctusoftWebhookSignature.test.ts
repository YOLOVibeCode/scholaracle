import {
  signNoctusoftWebhookBody,
  verifyNoctusoftWebhookSignature,
} from './verifyNoctusoftWebhookSignature';

describe('verifyNoctusoftWebhookSignature', () => {
  const secret = 'whsec_test_secret';

  it('accepts a valid HMAC signature', () => {
    const body = '{"version":1,"id":"evt_1","type":"purchase.paid"}';
    const sig = signNoctusoftWebhookBody(body, secret);
    expect(verifyNoctusoftWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects tampered body', () => {
    const body = '{"version":1,"id":"evt_1"}';
    const sig = signNoctusoftWebhookBody(body, secret);
    expect(verifyNoctusoftWebhookSignature(`${body} `, sig, secret)).toBe(false);
  });

  it('rejects empty signature', () => {
    expect(verifyNoctusoftWebhookSignature('{}', '', secret)).toBe(false);
  });
});
