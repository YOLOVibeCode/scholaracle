import { MFAService } from './MFAService';

describe('MFAService', () => {
  let mfaService: MFAService;

  beforeAll(() => {
    mfaService = new MFAService('Test Service');
  });

  describe('generateSecret', () => {
    it('should generate MFA secret', () => {
      const result = mfaService.generateSecret('admin@test.com');

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThan(0);
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.manualEntryKey).toBeDefined();
    });

    it('should generate unique secrets', () => {
      const result1 = mfaService.generateSecret('admin1@test.com');
      const result2 = mfaService.generateSecret('admin2@test.com');

      expect(result1.secret).not.toBe(result2.secret);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid TOTP token', () => {
      const { secret } = mfaService.generateSecret('admin@test.com');
      
      // Generate a valid token
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const isValid = mfaService.verifyToken(secret, token);
      expect(isValid).toBe(true);
    });

    it('should reject invalid TOTP token', () => {
      const { secret } = mfaService.generateSecret('admin@test.com');
      const invalidToken = '000000';

      const isValid = mfaService.verifyToken(secret, invalidToken);
      expect(isValid).toBe(false);
    });

    it('should reject token for different secret', () => {
      const { secret: secret1 } = mfaService.generateSecret('admin1@test.com');
      const { secret: secret2 } = mfaService.generateSecret('admin2@test.com');

      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({
        secret: secret1,
        encoding: 'base32',
      });

      const isValid = mfaService.verifyToken(secret2, token);
      expect(isValid).toBe(false);
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code data URL', async () => {
      const { qrCodeUrl } = mfaService.generateSecret('admin@test.com');
      const qrCode = await mfaService.generateQRCode(qrCodeUrl);

      expect(qrCode).toBeDefined();
      expect(qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });
});

