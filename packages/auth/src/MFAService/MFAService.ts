import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface IMFASetupResult {
  readonly secret: string;
  readonly qrCodeUrl: string;
  readonly manualEntryKey: string;
}

export interface IMFAService {
  generateSecret(adminEmail: string, serviceName?: string): IMFASetupResult;
  verifyToken(secret: string, token: string): boolean;
  generateQRCode(otpauthUrl: string): Promise<string>;
}

/**
 * Multi-Factor Authentication service using TOTP.
 */
export class MFAService implements IMFAService {
  private readonly _serviceName: string;

  constructor(serviceName: string = 'Scholaracle Admin') {
    this._serviceName = serviceName;
  }

  /**
   * Generate a new MFA secret for an admin user.
   *
   * @param adminEmail - Admin user email
   * @param serviceName - Service name for QR code
   * @returns MFA setup result with secret and QR code
   */
  public generateSecret(adminEmail: string, serviceName?: string): IMFASetupResult {
    const secret = speakeasy.generateSecret({
      name: `${serviceName ?? this._serviceName} (${adminEmail})`,
      issuer: serviceName ?? this._serviceName,
      length: 32,
    });

    return {
      secret: secret.base32 ?? '',
      qrCodeUrl: secret.otpauth_url ?? '',
      manualEntryKey: secret.base32 ?? '',
    };
  }

  /**
   * Verify a TOTP token against a secret.
   *
   * @param secret - MFA secret (base32)
   * @param token - TOTP token to verify
   * @returns True if token is valid
   */
  public verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps (60 seconds) of tolerance
    });
  }

  /**
   * Generate QR code data URL from OTP auth URL.
   *
   * @param otpauthUrl - OTP auth URL
   * @returns QR code data URL
   */
  public async generateQRCode(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }
}

