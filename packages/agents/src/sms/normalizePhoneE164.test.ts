import { normalizePhoneE164 } from './normalizePhoneE164';

describe('normalizePhoneE164', () => {
  it('normalizes US 10-digit to E.164', () => {
    expect(normalizePhoneE164('5125550100')).toBe('+15125550100');
  });

  it('accepts already E.164', () => {
    expect(normalizePhoneE164('+15125550100')).toBe('+15125550100');
  });

  it('normalizes UK numbers when given international format', () => {
    expect(normalizePhoneE164('+447911123456')).toBe('+447911123456');
  });

  it('returns null for invalid numbers', () => {
    expect(normalizePhoneE164('abc')).toBeNull();
  });

  it('requires non-empty input', () => {
    expect(() => normalizePhoneE164('')).toThrow(/required/);
    expect(() => normalizePhoneE164('   ')).toThrow(/required/);
  });
});
