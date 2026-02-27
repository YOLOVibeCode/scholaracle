import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Db } from 'mongodb';
import {
  AdminUserRepository,
  AdminUserRepository as AdminUserRepo,
  type IAdminRevokedTokenStore,
  type IAdminMFATokenStore,
  type IPasswordResetTokenStore,
} from '@scholaracle/database';
import type { IAdminUserData, AdminRole } from '@scholaracle/database';
import { MFAService, type IMFAService } from '../MFAService';
import type { IPasswordResetEmailSender } from '../PasswordResetEmailSender';

export interface IAdminAuthResult {
  readonly success: boolean;
  readonly token?: string;
  readonly mfaToken?: string;
  readonly requiresMFA?: boolean;
  /** When true, admin must complete MFA setup before logging in (no token issued). */
  readonly requiresMFASetup?: boolean;
  /** Short-lived token for MFA setup flow (get QR, then complete with TOTP). */
  readonly mfaSetupToken?: string;
  readonly admin?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role: AdminRole;
  };
  readonly error?: string;
}

export interface IAdminTokenPayload {
  readonly adminId: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly type: 'admin';
}

export interface IAdminAuthService {
  register(
    email: string,
    password: string,
    name: string,
    role: AdminRole,
    createdBy: string
  ): Promise<IAdminAuthResult>;
  login(email: string, password: string): Promise<IAdminAuthResult>;
  verifyMFAToken(mfaToken: string, totpToken: string): Promise<IAdminAuthResult>;
  /** Get QR code and manual key for MFA setup (requires valid mfaSetupToken from login). */
  getMFASetupData(
    mfaSetupToken: string
  ): Promise<{ qrCodeUrl: string; manualEntryKey: string } | { error: string }>;
  /** Complete MFA setup with TOTP verification and issue admin JWT. */
  completeMFASetup(mfaSetupToken: string, totpToken: string): Promise<IAdminAuthResult>;
  verifyToken(token: string): Promise<IAdminTokenPayload | null>;
  issueStepUpToken(adminId: string): Promise<string | null>;
  verifyStepUpToken(
    token: string
  ): Promise<{ adminId: string; type: 'step_up'; issuedAt: number; expiresAt: number } | null>;
  refreshToken(token: string): Promise<IAdminAuthResult>;
  logout(token: string): Promise<boolean>;
  requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }>;
  resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }>;
}

/**
 * Authentication service for admin users.
 */
export class AdminAuthService implements IAdminAuthService {
  private readonly _adminRepository: AdminUserRepository;
  private readonly _mfaService: IMFAService;
  private readonly _jwtSecret: string;
  private readonly _jwtExpiresIn: string;
  private readonly _mfaTokenExpiresIn: string = '5m';
  private readonly _mfaTokenStore?: IAdminMFATokenStore;
  /** In-memory fallback when _mfaTokenStore is not provided (e.g. tests). */
  private readonly _mfaTokens: Map<string, { adminId: string; secret: string; expiresAt: Date }> =
    new Map();
  private readonly _revokedTokenStore?: IAdminRevokedTokenStore;
  private readonly _passwordResetTokenStore?: IPasswordResetTokenStore;
  private readonly _passwordResetEmailSender?: IPasswordResetEmailSender;
  private readonly _adminBaseUrl?: string;

  constructor(
    database: Db,
    jwtSecret?: string,
    jwtExpiresIn?: string,
    mfaService?: IMFAService,
    revokedTokenStore?: IAdminRevokedTokenStore,
    mfaTokenStore?: IAdminMFATokenStore,
    passwordResetTokenStore?: IPasswordResetTokenStore,
    passwordResetEmailSender?: IPasswordResetEmailSender,
    adminBaseUrl?: string
  ) {
    this._adminRepository = new AdminUserRepository(database);
    this._mfaService = mfaService ?? new MFAService();
    this._jwtSecret =
      jwtSecret ??
      process.env['ADMIN_JWT_SECRET'] ??
      process.env['JWT_SECRET'] ??
      'default-admin-secret';
    this._jwtExpiresIn = jwtExpiresIn ?? process.env['ADMIN_JWT_EXPIRES_IN'] ?? '8h';
    this._revokedTokenStore = revokedTokenStore;
    this._mfaTokenStore = mfaTokenStore;
    this._passwordResetTokenStore = passwordResetTokenStore;
    this._passwordResetEmailSender = passwordResetEmailSender;
    this._adminBaseUrl =
      adminBaseUrl ??
      process.env['ADMIN_BASE_URL'] ??
      process.env['BASE_URL'] ??
      process.env['WEB_URL'];
  }

  /**
   * Register a new admin user (super_admin only).
   *
   * @param email - Admin email
   * @param password - Admin password
   * @param name - Admin name
   * @param role - Admin role
   * @param createdBy - ID of admin creating this user
   * @returns Auth result with token
   */
  public async register(
    email: string,
    password: string,
    name: string,
    role: AdminRole,
    createdBy: string
  ): Promise<IAdminAuthResult> {
    try {
      // Verify creator exists and is an active admin
      const creator = await this._adminRepository.findById(createdBy);
      if (!creator) {
        return {
          success: false,
          error: 'Admin user not found',
        };
      }

      // Check if admin already exists
      const existingAdmin = await this._adminRepository.findByEmail(email);
      if (existingAdmin) {
        return {
          success: false,
          error: 'Admin user already exists',
        };
      }

      // Hash password
      const passwordHash = await AdminUserRepo.hashPassword(password);

      // Create admin
      const adminData: IAdminUserData = {
        email,
        passwordHash,
        name,
        role,
        createdBy,
      };

      const admin = await this._adminRepository.create(adminData);

      // Generate token
      const token = this._generateToken(admin._id?.toString() ?? '', email, role);

      return {
        success: true,
        token,
        admin: {
          id: admin._id?.toString() ?? '',
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Login admin user.
   *
   * @param email - Admin email
   * @param password - Admin password
   * @returns Auth result with token or MFA requirement
   */
  public async login(email: string, password: string): Promise<IAdminAuthResult> {
    const LOCKOUT_AFTER = 5;
    const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

    try {
      // Find admin
      const admin = await this._adminRepository.findByEmail(email);
      if (!admin) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Check if admin is active
      if (!admin.isActive) {
        return {
          success: false,
          error: 'Admin account is inactive',
        };
      }

      // Check lockout
      const now = new Date();
      if (admin.lockedUntil && admin.lockedUntil > now) {
        return {
          success: false,
          error: 'Account temporarily locked due to too many failed attempts. Try again later.',
        };
      }

      // Verify password
      const isValidPassword = await AdminUserRepo.verifyPassword(password, admin.passwordHash);
      if (!isValidPassword) {
        const attempts = (admin.failedLoginAttempts ?? 0) + 1;
        const updates: Partial<{ failedLoginAttempts: number; lockedUntil: Date }> = {
          failedLoginAttempts: attempts,
        };
        if (attempts >= LOCKOUT_AFTER) {
          updates.lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        }
        await this._adminRepository.update(admin._id!.toString(), updates);
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Success: clear lockout and update last login
      await this._adminRepository.update(admin._id!.toString(), {
        failedLoginAttempts: 0,
        lockedUntil: undefined,
      });
      await this._adminRepository.updateLastLogin(admin._id!.toString(), new Date());

      // MFA is required for all admins: if not set up, force setup flow
      if (!admin.mfaEnabled || !admin.mfaSecret) {
        const mfaSetupToken = this._generateMFASetupToken(admin._id!.toString());
        return {
          success: false,
          requiresMFASetup: true,
          mfaSetupToken,
        };
      }

      // MFA is enabled: require TOTP verification
      const mfaToken = this._generateMFAToken(admin._id!.toString(), admin.mfaSecret);

      return {
        success: false,
        requiresMFA: true,
        mfaToken,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Get QR code and manual entry key for MFA setup. Call after login returns requiresMFASetup.
   * Stores the generated secret server-side for verification in completeMFASetup.
   */
  public async getMFASetupData(
    mfaSetupToken: string
  ): Promise<{ qrCodeUrl: string; manualEntryKey: string } | { error: string }> {
    try {
      const decoded = jwt.verify(mfaSetupToken, this._jwtSecret) as {
        adminId: string;
        type: 'mfa_setup';
        exp: number;
      };
      if (decoded.type !== 'mfa_setup') {
        return { error: 'Invalid MFA setup token' };
      }

      const admin = await this._adminRepository.findById(decoded.adminId);
      if (!admin || !admin.isActive) {
        return { error: 'Admin not found or inactive' };
      }

      const setupResult = this._mfaService.generateSecret(admin.email);
      const qrCodeUrl = await this._mfaService.generateQRCode(setupResult.qrCodeUrl);
      const expiresAt = new Date((decoded.exp + 60) * 1000); // use JWT exp + buffer

      if (this._mfaTokenStore) {
        await this._mfaTokenStore.delete(mfaSetupToken);
        await this._mfaTokenStore.create(
          mfaSetupToken,
          decoded.adminId,
          setupResult.secret,
          expiresAt
        );
      } else {
        this._mfaTokens.delete(mfaSetupToken);
        this._mfaTokens.set(mfaSetupToken, {
          adminId: decoded.adminId,
          secret: setupResult.secret,
          expiresAt,
        });
      }

      return { qrCodeUrl, manualEntryKey: setupResult.manualEntryKey };
    } catch {
      return { error: 'Invalid or expired MFA setup token' };
    }
  }

  /**
   * Complete MFA setup: verify TOTP, persist secret, issue admin JWT.
   */
  public async completeMFASetup(
    mfaSetupToken: string,
    totpToken: string
  ): Promise<IAdminAuthResult> {
    try {
      const decoded = jwt.verify(mfaSetupToken, this._jwtSecret) as {
        adminId: string;
        type: 'mfa_setup';
        exp: number;
      };
      if (decoded.type !== 'mfa_setup') {
        return { success: false, error: 'Invalid MFA setup token' };
      }

      let mfaData: { adminId: string; secret: string } | null = null;
      if (this._mfaTokenStore) {
        mfaData = await this._mfaTokenStore.get(mfaSetupToken);
      } else {
        const inMem = this._mfaTokens.get(mfaSetupToken);
        if (inMem) mfaData = { adminId: inMem.adminId, secret: inMem.secret };
      }
      if (!mfaData || mfaData.adminId !== decoded.adminId) {
        return { success: false, error: 'MFA setup expired or invalid. Please log in again.' };
      }

      const isValid = this._mfaService.verifyToken(mfaData.secret, totpToken);
      if (!isValid) {
        return { success: false, error: 'Invalid MFA code' };
      }

      const admin = await this._adminRepository.findById(decoded.adminId);
      if (!admin || !admin.isActive) {
        return { success: false, error: 'Admin not found or inactive' };
      }

      if (this._mfaTokenStore) {
        await this._mfaTokenStore.delete(mfaSetupToken);
      } else {
        this._mfaTokens.delete(mfaSetupToken);
      }

      await this._adminRepository.update(decoded.adminId, {
        mfaEnabled: true,
        mfaSecret: mfaData.secret,
      });

      const token = this._generateToken(admin._id?.toString() ?? '', admin.email, admin.role);
      return {
        success: true,
        token,
        admin: {
          id: admin._id?.toString() ?? '',
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MFA setup failed',
      };
    }
  }

  /**
   * Verify MFA token and complete login.
   *
   * @param mfaToken - Temporary MFA token from login
   * @param totpToken - TOTP code from authenticator app
   * @returns Auth result with final token
   */
  public async verifyMFAToken(mfaToken: string, totpToken: string): Promise<IAdminAuthResult> {
    try {
      // Decode MFA token
      const decoded = jwt.verify(mfaToken, this._jwtSecret) as {
        adminId: string;
        type: 'mfa';
        expiresAt: number;
      };

      if (decoded.type !== 'mfa') {
        return {
          success: false,
          error: 'Invalid MFA token',
        };
      }

      // Check expiration
      if (Date.now() > decoded.expiresAt) {
        return {
          success: false,
          error: 'MFA token expired',
        };
      }

      // Get stored MFA data (from DB or in-memory fallback)
      let mfaData: { adminId: string; secret: string } | null = null;
      if (this._mfaTokenStore) {
        mfaData = await this._mfaTokenStore.get(mfaToken);
      } else {
        const inMem = this._mfaTokens.get(mfaToken);
        if (inMem) mfaData = { adminId: inMem.adminId, secret: inMem.secret };
      }
      if (!mfaData || mfaData.adminId !== decoded.adminId) {
        return {
          success: false,
          error: 'Invalid MFA token',
        };
      }

      // Verify TOTP token
      const isValid = this._mfaService.verifyToken(mfaData.secret, totpToken);
      if (!isValid) {
        return {
          success: false,
          error: 'Invalid MFA code',
        };
      }

      // Get admin
      const admin = await this._adminRepository.findById(decoded.adminId);
      if (!admin || !admin.isActive) {
        return {
          success: false,
          error: 'Admin account not found or inactive',
        };
      }

      // Clean up MFA token
      if (this._mfaTokenStore) {
        await this._mfaTokenStore.delete(mfaToken);
      } else {
        this._mfaTokens.delete(mfaToken);
      }

      // Generate final token
      const token = this._generateToken(admin._id?.toString() ?? '', admin.email, admin.role);

      return {
        success: true,
        token,
        admin: {
          id: admin._id?.toString() ?? '',
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MFA verification failed',
      };
    }
  }

  /**
   * Verify admin JWT token.
   *
   * @param token - JWT token
   * @returns Decoded token data or null if invalid or revoked
   */
  public async verifyToken(token: string): Promise<IAdminTokenPayload | null> {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as IAdminTokenPayload & {
        jti?: string;
        exp?: number;
      };

      if (decoded.type !== 'admin') {
        return null;
      }

      if (this._revokedTokenStore && decoded.jti) {
        const revoked = await this._revokedTokenStore.isRevoked(decoded.jti);
        if (revoked) return null;
      }

      // Verify admin still exists and is active
      const admin = await this._adminRepository.findById(decoded.adminId);
      if (!admin || !admin.isActive) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Mint a short-lived step-up token after successful MFA re-verification.
   * This is used for sensitive admin actions (refund, impersonate, admin user management).
   */
  public async issueStepUpToken(adminId: string): Promise<string | null> {
    const admin = await this._adminRepository.findById(adminId);
    if (!admin || !admin.isActive || !admin.mfaEnabled || !admin.mfaSecret) return null;

    const issuedAt = Date.now();
    const expiresAt = issuedAt + 5 * 60 * 1000;
    return jwt.sign({ adminId, type: 'step_up', issuedAt, expiresAt }, this._jwtSecret, {
      expiresIn: '5m',
    } as jwt.SignOptions) as string;
  }

  /**
   * Verify a step-up token.
   */
  public async verifyStepUpToken(
    token: string
  ): Promise<{ adminId: string; type: 'step_up'; issuedAt: number; expiresAt: number } | null> {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as {
        adminId: string;
        type: 'step_up';
        issuedAt: number;
        expiresAt: number;
      };
      if (decoded.type !== 'step_up') return null;

      const admin = await this._adminRepository.findById(decoded.adminId);
      if (!admin || !admin.isActive) return null;

      if (Date.now() > decoded.expiresAt) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Refresh admin token.
   *
   * @param token - Current token
   * @returns New token
   */
  public async refreshToken(token: string): Promise<IAdminAuthResult> {
    const decoded = await this.verifyToken(token);
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid token',
      };
    }

    const newToken = this._generateToken(decoded.adminId, decoded.email, decoded.role);

    return {
      success: true,
      token: newToken,
    };
  }

  /**
   * Logout admin (invalidate token by adding to blacklist).
   *
   * @param token - Token to invalidate
   * @returns True if logged out
   */
  public async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;
      if (!decoded || !decoded.jti) return true;

      if (this._revokedTokenStore) {
        const expiresAt = decoded.exp
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + 8 * 60 * 60 * 1000);
        await this._revokedTokenStore.revoke(decoded.jti, expiresAt);
      }
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Request admin password reset. Always returns success to avoid email enumeration.
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    if (!this._passwordResetTokenStore || !this._passwordResetEmailSender || !this._adminBaseUrl) {
      return { success: false, error: 'Admin password reset is not configured' };
    }

    const admin = await this._adminRepository.findByEmail(email);
    if (!admin) return { success: true };

    try {
      const adminId = admin._id?.toString() ?? '';
      await this._passwordResetTokenStore.invalidateForUser(adminId);

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await this._passwordResetTokenStore.create(adminId, token, expiresAt);

      const resetUrl = `${this._adminBaseUrl.replace(/\/$/, '')}/admin/reset-password?token=${encodeURIComponent(token)}`;
      await this._passwordResetEmailSender.sendResetLink(email, resetUrl);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send reset link',
      };
    }
  }

  /**
   * Reset admin password using a valid reset token.
   */
  public async resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._passwordResetTokenStore) {
      return { success: false, error: 'Admin password reset is not configured' };
    }

    const valid = await this._passwordResetTokenStore.findValidByToken(token);
    if (!valid) {
      return { success: false, error: 'Invalid or expired reset link. Please request a new one.' };
    }

    try {
      const passwordHash = await AdminUserRepo.hashPassword(newPassword);
      await this._adminRepository.update(valid.userId, { passwordHash });
      await this._passwordResetTokenStore.invalidateForUser(valid.userId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset password',
      };
    }
  }

  /**
   * Generate JWT token for admin (with jti for revocation).
   *
   * @param adminId - Admin ID
   * @param email - Admin email
   * @param role - Admin role
   * @returns JWT token
   */
  private _generateToken(adminId: string, email: string, role: AdminRole): string {
    const jti = crypto.randomUUID();
    return jwt.sign({ adminId, email, role, type: 'admin' }, this._jwtSecret, {
      expiresIn: this._jwtExpiresIn,
      jwtid: jti,
    } as jwt.SignOptions) as string;
  }

  /**
   * Generate temporary MFA token.
   *
   * @param adminId - Admin ID
   * @param secret - MFA secret
   * @returns MFA token
   */
  private _generateMFAToken(adminId: string, secret: string): string {
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const expiresAtDate = new Date(expiresAt);
    const token = jwt.sign({ adminId, type: 'mfa', expiresAt }, this._jwtSecret, {
      expiresIn: this._mfaTokenExpiresIn,
    } as jwt.SignOptions) as string;

    // Store MFA data in DB when store is provided; otherwise in-memory
    if (this._mfaTokenStore) {
      void this._mfaTokenStore.create(token, adminId, secret, expiresAtDate);
    } else {
      this._mfaTokens.set(token, { adminId, secret, expiresAt: expiresAtDate });
    }

    return token;
  }

  /** Generate short-lived JWT for MFA setup flow (10 min). */
  private _generateMFASetupToken(adminId: string): string {
    return jwt.sign({ adminId, type: 'mfa_setup' }, this._jwtSecret, {
      expiresIn: '10m',
    } as jwt.SignOptions) as string;
  }
}
