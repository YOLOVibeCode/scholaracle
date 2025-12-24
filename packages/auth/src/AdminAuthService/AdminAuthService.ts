import jwt from 'jsonwebtoken';
import type { Db } from 'mongodb';
import { AdminUserRepository, AdminUserRepository as AdminUserRepo } from '@scholaracle/database';
import type { IAdminUserData, AdminRole } from '@scholaracle/database';
import { MFAService, type IMFAService } from '../MFAService';

export interface IAdminAuthResult {
  readonly success: boolean;
  readonly token?: string;
  readonly mfaToken?: string;
  readonly requiresMFA?: boolean;
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
  verifyToken(token: string): Promise<IAdminTokenPayload | null>;
  issueStepUpToken(adminId: string): Promise<string | null>;
  verifyStepUpToken(token: string): Promise<{ adminId: string; type: 'step_up'; issuedAt: number; expiresAt: number } | null>;
  refreshToken(token: string): Promise<IAdminAuthResult>;
  logout(token: string): Promise<boolean>;
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
  private readonly _mfaTokens: Map<string, { adminId: string; secret: string; expiresAt: Date }> =
    new Map();

  constructor(
    database: Db,
    jwtSecret?: string,
    jwtExpiresIn?: string,
    mfaService?: IMFAService
  ) {
    this._adminRepository = new AdminUserRepository(database);
    this._mfaService = mfaService ?? new MFAService();
    this._jwtSecret = jwtSecret ?? process.env['ADMIN_JWT_SECRET'] ?? process.env['JWT_SECRET'] ?? 'default-admin-secret';
    this._jwtExpiresIn = jwtExpiresIn ?? process.env['ADMIN_JWT_EXPIRES_IN'] ?? '8h';
  }

  /**
   * Register a new admin user (super_admin only).
   *
   * @param email - Admin email
   * @param password - Admin password
   * @param name - Admin name
   * @param role - Admin role
   * @param createdBy - ID of admin creating this user (must be super_admin)
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
      // Verify creator is super_admin
      const creator = await this._adminRepository.findById(createdBy);
      if (!creator || creator.role !== 'super_admin') {
        return {
          success: false,
          error: 'Only super_admin can create admin users',
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

      // Verify password
      const isValidPassword = await AdminUserRepo.verifyPassword(password, admin.passwordHash);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Update last login
      await this._adminRepository.updateLastLogin(admin._id!.toString(), new Date());

      // Check if MFA is enabled
      if (admin.mfaEnabled && admin.mfaSecret) {
        // Generate temporary MFA token
        const mfaToken = this._generateMFAToken(admin._id!.toString(), admin.mfaSecret);

        return {
          success: false,
          requiresMFA: true,
          mfaToken,
        };
      }

      // Generate token
      const token = this._generateToken(admin._id?.toString() ?? '', email, admin.role);

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
        error: error instanceof Error ? error.message : 'Login failed',
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

      // Get stored MFA data
      const mfaData = this._mfaTokens.get(mfaToken);
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
      this._mfaTokens.delete(mfaToken);

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
   * @returns Decoded token data or null if invalid
   */
  public async verifyToken(token: string): Promise<IAdminTokenPayload | null> {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as IAdminTokenPayload;

      if (decoded.type !== 'admin') {
        return null;
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
    return jwt.sign(
      { adminId, type: 'step_up', issuedAt, expiresAt },
      this._jwtSecret,
      { expiresIn: '5m' } as jwt.SignOptions
    ) as string;
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
   * Logout admin (invalidate token).
   *
   * @param token - Token to invalidate
   * @returns True if logged out
   */
  public async logout(token: string): Promise<boolean> {
    // In a production system, you'd want to maintain a blacklist of tokens
    // For now, we'll just verify the token is valid
    const decoded = await this.verifyToken(token);
    return decoded !== null;
  }

  /**
   * Generate JWT token for admin.
   *
   * @param adminId - Admin ID
   * @param email - Admin email
   * @param role - Admin role
   * @returns JWT token
   */
  private _generateToken(adminId: string, email: string, role: AdminRole): string {
    return jwt.sign(
      { adminId, email, role, type: 'admin' },
      this._jwtSecret,
      { expiresIn: this._jwtExpiresIn } as jwt.SignOptions
    ) as string;
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
    const token = jwt.sign(
      { adminId, type: 'mfa', expiresAt },
      this._jwtSecret,
      { expiresIn: this._mfaTokenExpiresIn } as jwt.SignOptions
    ) as string;

    // Store MFA data
    this._mfaTokens.set(token, {
      adminId,
      secret,
      expiresAt: new Date(expiresAt),
    });

    return token;
  }

}

