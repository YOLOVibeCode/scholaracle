import { normalizePhoneE164 } from './normalizePhoneE164';

describe('normalizePhoneE164', () => {
  it('normalizes US 10-digit to E.164', () => {
    expect(normalizePhoneE164('5125550100')).toBe('+15125550100');
  });

  it('accepts already E.164', () => {
    expect(normalizePhoneE164('+15125550100')).toBe('+15125550100');
  });

  it('rejects invalid numbers', () => {
    expect(() => normalizePhoneE164('abc')).toThrow(/Invalid phone/);
  });
});
