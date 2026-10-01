import { signRelayInboundBody, verifyRelayInboundSignature } from './verifyRelayInboundSignature';

const URL = 'https://api.scholarmancy.com/api/webhooks/twilio/sms';
const SECRET = 'test-relay-secret';

describe('verifyRelayInboundSignature', () => {
  it('accepts valid signature', () => {
    const raw = 'From=%2B15125550100&Body=STOP';
    const sig = signRelayInboundBody(URL, raw, SECRET);
    expect(verifyRelayInboundSignature(URL, raw, sig, SECRET)).toBe(true);
  });

  it('rejects tampered body', () => {
    const raw = 'From=%2B15125550100&Body=STOP';
    const sig = signRelayInboundBody(URL, raw, SECRET);
    expect(verifyRelayInboundSignature(URL, `${raw}x`, sig, SECRET)).toBe(false);
  });

  it('rejects wrong public URL', () => {
    const raw = 'From=%2B15125550100&Body=STOP';
    const sig = signRelayInboundBody(URL, raw, SECRET);
    expect(verifyRelayInboundSignature(`${URL}/extra`, raw, sig, SECRET)).toBe(false);
  });
});
