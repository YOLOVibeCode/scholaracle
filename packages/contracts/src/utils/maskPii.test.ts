import { maskCardNumber, maskEmail, maskPhone, maskPiiDeep, maskPiiInString } from './maskPii';

describe('maskPii', () => {
  describe('maskEmail', () => {
    it('should mask local part', () => {
      expect(maskEmail('user@example.com')).toBe('u***@example.com');
    });

    it('should return placeholder for invalid email', () => {
      expect(maskEmail('not-an-email')).toBe('***');
    });
  });

  describe('maskPhone', () => {
    it('should mask middle digits', () => {
      expect(maskPhone('+15551234567')).toBe('+1***4567');
    });

    it('should return placeholder for short values', () => {
      expect(maskPhone('123')).toBe('***');
    });
  });

  describe('maskCardNumber', () => {
    it('should show only last4 for PAN-length digit strings', () => {
      expect(maskCardNumber('4242424242424242')).toBe('•••• 4242');
    });
  });

  describe('maskPiiInString', () => {
    it('should mask embedded email and phone', () => {
      const input = 'contact pii-seed-m3-12@example.com or +15557654321';
      const out = maskPiiInString(input);
      expect(out).not.toContain('pii-seed-m3-12@example.com');
      expect(out).not.toContain('7654321');
    });
  });

  describe('maskPiiDeep', () => {
    it('should mask known fields in nested metadata', () => {
      const out = maskPiiDeep({
        recipientEmail: 'parent@example.com',
        nested: { phone: '+19998887777', note: 'ok' },
        metadata: { cardNumber: '4111111111111111' },
      }) as Record<string, unknown>;

      expect(out['recipientEmail']).toBe('p***@example.com');
      expect((out['nested'] as Record<string, unknown>)['phone']).toBe('+1***7777');
      expect((out['metadata'] as Record<string, unknown>)['cardNumber']).toBe('•••• 1111');
    });
  });
});
