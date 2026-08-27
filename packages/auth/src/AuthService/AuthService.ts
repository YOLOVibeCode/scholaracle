import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Db } from 'mongodb';
import {
  UserRepository,
  UserRepository as UserRepo,
  type IPasswordResetTokenStore,
  type IRefreshTokenStore,
  type IOAuthAccountRepository,
} from '@scholaracle/database';
import type { IUserData, User, UserRole } from '@scholaracle/database';
import type { OAuthProvider } from '@scholaracle/database';
import type { IPasswordResetEmailSender } from '../PasswordResetEmailSender';

export interface IAuthUserPayload {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly studentId?: string;
}

export interface IAuthTokenPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly fid?: string;
  readonly studentId?: string;
}

export interface IAuthResult {
  readonly success: boolean;
  readonly token?: string;
  readonly refreshToken?: string;
  /** Refresh token family ID (for session management). */
  readonly familyId?: string;
  /** When false, client should use sessionStorage and token has shorter expiry. */
  readonly rememberMe?: boolean;
  readonly user?: IAuthUserPayload;
  /** When true, client should redirect to reset-password on next login. */
  readonly forcePasswordReset?: boolean;
  readonly error?: string;
}

export interface IRequestPasswordResetResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface IRefreshResult {
  readonly token: string;
  readonly refreshToken: string;
  /** Refresh token family ID (for session management). */
  readonly familyId: string;
}

export interface IRegisterOptions {
  readonly phone?: string;
  readonly smsConsent?: boolean;
}

export interface IAuthService {
  register(
    email: string,
    password: string,
    name: string,
    options?: IRegisterOptions & { rememberMe?: boolean }
  ): Promise<IAuthResult>;
  login(email: string, password: string, options?: { rememberMe?: boolean }): Promise<IAuthResult>;
  /** Find or create user via OAuth provider; link account if existing user; issue tokens. */
  loginOrRegisterOAuth(
    provider: OAuthProvider,
    providerAccountId: string,
    email: string,
    name: string
  ): Promise<IAuthResult>;
  /** Link an OAuth provider to an existing user (e.g. from settings). */
  linkOAuthAccount(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string,
    email: string
  ): Promise<{ success: boolean; error?: string }>;
  /** Unlink an OAuth provider from a user. */
  unlinkOAuthAccount(
    userId: string,
    provider: OAuthProvider
  ): Promise<{ success: boolean; error?: string }>;
  verifyToken(token: string): Promise<IAuthTokenPayload | null>;
  requestPasswordReset(email: string): Promise<IRequestPasswordResetResult>;
  resetPasswordWithToken(token: string, newPassword: string): Promise<IRequestPasswordResetResult>;
  refreshAccessToken(refreshToken: string): Promise<IRefreshResult | { error: string }>;
  revokeRefreshToken(refreshToken: string): Promise<{ success: boolean; error?: string }>;
  /**
   * Issue a JWT + refresh for an already-authenticated user (magic-link consume).
   * By default only student-role, non-suspended users succeed.
   * Pass `{ allowParent: true }` (magic-link consume path only) to also accept parent-role users.
   */
  createSessionForUser(
    userId: string,
    options?: { rememberMe?: boolean; allowParent?: boolean }
  ): Promise<IAuthResult>;
}

function roleFromUser(user: { role?: string }): UserRole {
  return user.role === 'student' ? 'student' : 'parent';
}

function tokenClaimsFromUser(
  user: User,
  familyId?: string
): { familyId?: string; role: UserRole; studentId?: string } {
  const role = roleFromUser(user);
  return {
    role,
    ...(familyId ? { familyId } : {}),
    ...(role === 'student' && user.studentId ? { studentId: user.studentId } : {}),
  };
}

function publicUserFromUser(user: User): IAuthUserPayload {
  const role = roleFromUser(user);
  return {
    id: user._id?.toString() ?? '',
    email: user.email,
    name: user.name,
    role,
    ...(role === 'student' && user.studentId ? { studentId: user.studentId } : {}),
  };
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || match[1] == null || match[2] == null) return 30 * MS_PER_DAY;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * MS_PER_DAY;
  return 30 * MS_PER_DAY;
}

/**
 * Authentication service for user registration, login, password reset, and refresh tokens.
 */
/** Session-only refresh token expiry (when rememberMe is false). */
const SESSION_REFRESH_DEFAULT = '24h';

export class AuthService implements IAuthService {
  private readonly _userRepository: UserRepository;
  private readonly _oauthAccountRepository?: IOAuthAccountRepository;
  private readonly _jwtSecret: string;
  private readonly _jwtExpiresIn: string;
  private readonly _refreshTokenExpiresInMs: number;
  private readonly _sessionRefreshTokenExpiresInMs: number;
  private readonly _passwordResetTokenStore?: IPasswordResetTokenStore;
  private readonly _refreshTokenStore?: IRefreshTokenStore;
  private readonly _passwordResetEmailSender?: IPasswordResetEmailSender;
  private readonly _baseUrl?: string;

  constructor(
    database: Db,
    jwtSecret?: string,
    jwtExpiresIn?: string,
    passwordResetTokenStore?: IPasswordResetTokenStore,
    passwordResetEmailSender?: IPasswordResetEmailSender,
    baseUrl?: string,
    refreshTokenStore?: IRefreshTokenStore,
    refreshTokenExpiresIn?: string,
    sessionRefreshTokenExpiresIn?: string,
    oauthAccountRepository?: IOAuthAccountRepository
  ) {
    this._userRepository = new UserRepository(database);
    this._oauthAccountRepository = oauthAccountRepository;
    this._jwtSecret =
      jwtSecret ?? process.env['JWT_SECRET'] ?? 'default-secret-change-in-production';
    this._jwtExpiresIn =
      jwtExpiresIn ??
      process.env['JWT_ACCESS_EXPIRES_IN'] ??
      process.env['JWT_EXPIRES_IN'] ??
      '15m';
    this._refreshTokenExpiresInMs = refreshTokenExpiresIn
      ? parseExpiryToMs(refreshTokenExpiresIn)
      : parseExpiryToMs(process.env['REFRESH_TOKEN_EXPIRES_IN'] ?? '30d');
    this._sessionRefreshTokenExpiresInMs = parseExpiryToMs(
      sessionRefreshTokenExpiresIn ??
        process.env['SESSION_REFRESH_TOKEN_EXPIRES_IN'] ??
        SESSION_REFRESH_DEFAULT
    );
    this._passwordResetTokenStore = passwordResetTokenStore;
    this._passwordResetEmailSender = passwordResetEmailSender;
    this._baseUrl = baseUrl ?? process.env['BASE_URL'] ?? process.env['WEB_URL'];
    this._refreshTokenStore = refreshTokenStore;
  }

  /**
   * Register a new user.
   *
   * @param email - User email
   * @param password - User password
   * @param name - User name
   * @param options - Optional phone number and SMS consent
   * @returns Auth result with token
   */
  public async register(
    email: string,
    password: string,
    name: string,
    options?: IRegisterOptions & { rememberMe?: boolean }
  ): Promise<IAuthResult> {
    const rememberMe = options?.rememberMe !== false;
    try {
      // Check if user already exists
      const existingUser = await this._userRepository.findByEmail(email);
      if (existingUser) {
        return {
          success: false,
          error: 'User already exists',
        };
      }

      // Hash password
      const passwordHash = await UserRepo.hashPassword(password);

      // Create user
      const userData: IUserData = {
        email,
        passwordHash,
        name,
        role: 'parent',
        phone: options?.phone || undefined,
        smsConsent: options?.smsConsent ?? false,
      };

      const user = await this._userRepository.create(userData);

      const userId = user._id?.toString() ?? '';
      const emailVal = user.email;
      const refreshPair = await this._createRefreshToken(
        userId,
        emailVal,
        undefined,
        rememberMe ? undefined : this._sessionRefreshTokenExpiresInMs
      );
      const token = this._generateToken(
        userId,
        emailVal,
        tokenClaimsFromUser(user, refreshPair?.familyId)
      );

      return {
        success: true,
        token,
        refreshToken: refreshPair?.refreshToken,
        familyId: refreshPair?.familyId,
        rememberMe,
        user: publicUserFromUser(user),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Login user.
   *
   * @param email - User email
   * @param password - User password
   * @param options - Optional rememberMe (default true). When false, session-only with shorter refresh token.
   * @returns Auth result with token
   */
  public async login(
    email: string,
    password: string,
    options?: { rememberMe?: boolean }
  ): Promise<IAuthResult> {
    const rememberMe = options?.rememberMe !== false;
    try {
      // Find user
      const user = await this._userRepository.findByEmail(email);
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      if (user.isSuspended) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Verify password
      const isValidPassword = await UserRepo.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      return await this._issueSession(user, rememberMe);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Issue a session for a known user without a password (magic-link consume).
   * Parents and suspended students fail with the same message as a bad token.
   */
  public async createSessionForUser(
    userId: string,
    options?: { rememberMe?: boolean; allowParent?: boolean }
  ): Promise<IAuthResult> {
    const rememberMe = options?.rememberMe !== false;
    const allowParent = options?.allowParent === true;
    try {
      const user = await this._userRepository.findById(userId);
      const role = user ? roleFromUser(user) : null;
      if (!user || user.isSuspended || (!allowParent && role !== 'student')) {
        return { success: false, error: 'Invalid or expired sign-in link' };
      }
      return await this._issueSession(user, rememberMe);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  /**
   * Find or create user via OAuth provider; link account if existing user; issue tokens.
   * OAuth logins use rememberMe: true (30d refresh).
   */
  public async loginOrRegisterOAuth(
    provider: OAuthProvider,
    providerAccountId: string,
    email: string,
    name: string
  ): Promise<IAuthResult> {
    if (!this._oauthAccountRepository) {
      return { success: false, error: 'OAuth is not configured' };
    }
    try {
      // 1) Existing OAuth link -> login
      const existingLink = await this._oauthAccountRepository.findByProviderAndId(
        provider,
        providerAccountId
      );
      if (existingLink) {
        const user = await this._userRepository.findById(existingLink.userId);
        if (!user) {
          return { success: false, error: 'User no longer exists' };
        }
        const userId = user._id?.toString() ?? '';
        const refreshPair = await this._createRefreshToken(userId, user.email, undefined);
        const token = this._generateToken(
          userId,
          user.email,
          tokenClaimsFromUser(user, refreshPair?.familyId)
        );
        return {
          success: true,
          token,
          refreshToken: refreshPair?.refreshToken,
          familyId: refreshPair?.familyId,
          rememberMe: true,
          user: publicUserFromUser(user),
        };
      }

      // 2) User exists by email -> link OAuth and login
      const userByEmail = await this._userRepository.findByEmail(email);
      if (userByEmail) {
        await this._oauthAccountRepository.create(
          userByEmail._id!.toString(),
          provider,
          providerAccountId,
          email
        );
        const providers = [...(userByEmail.oauthProviders ?? []), provider];
        await this._userRepository.update(userByEmail._id!, { oauthProviders: providers });
        const userId = userByEmail._id?.toString() ?? '';
        const refreshPair = await this._createRefreshToken(userId, userByEmail.email, undefined);
        const token = this._generateToken(
          userId,
          userByEmail.email,
          tokenClaimsFromUser(userByEmail, refreshPair?.familyId)
        );
        return {
          success: true,
          token,
          refreshToken: refreshPair?.refreshToken,
          familyId: refreshPair?.familyId,
          rememberMe: true,
          user: publicUserFromUser(userByEmail),
        };
      }

      // 3) New user: create user (placeholder password) + OAuth link + login
      const passwordHash = await UserRepo.hashPassword(crypto.randomBytes(32).toString('hex'));
      const userData: IUserData = {
        email,
        passwordHash,
        name,
        role: 'parent',
        oauthProviders: [provider],
      };
      const user = await this._userRepository.create(userData);
      const userId = user._id?.toString() ?? '';
      await this._oauthAccountRepository.create(userId, provider, providerAccountId, email);
      const refreshPair = await this._createRefreshToken(userId, user.email, undefined);
      const token = this._generateToken(
        userId,
        user.email,
        tokenClaimsFromUser(user, refreshPair?.familyId)
      );
      return {
        success: true,
        token,
        refreshToken: refreshPair?.refreshToken,
        familyId: refreshPair?.familyId,
        rememberMe: true,
        user: publicUserFromUser(user),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth login failed',
      };
    }
  }

  /**
   * Link an OAuth provider to an existing user (e.g. from settings).
   */
  public async linkOAuthAccount(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string,
    email: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._oauthAccountRepository) {
      return { success: false, error: 'OAuth is not configured' };
    }
    try {
      const existing = await this._oauthAccountRepository.findByProviderAndId(
        provider,
        providerAccountId
      );
      if (existing && existing.userId !== userId) {
        return { success: false, error: 'This account is already linked to another user' };
      }
      if (existing && existing.userId === userId) {
        return { success: true };
      }
      const user = await this._userRepository.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      await this._oauthAccountRepository.create(userId, provider, providerAccountId, email);
      const providers = [...(user.oauthProviders ?? []), provider];
      await this._userRepository.update(userId, { oauthProviders: providers });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to link account',
      };
    }
  }

  /**
   * Unlink an OAuth provider from a user.
   */
  public async unlinkOAuthAccount(
    userId: string,
    provider: OAuthProvider
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._oauthAccountRepository) {
      return { success: false, error: 'OAuth is not configured' };
    }
    try {
      const user = await this._userRepository.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      const linked = user.oauthProviders ?? [];
      if (!linked.includes(provider)) {
        return { success: false, error: 'Provider is not linked' };
      }
      if (linked.length <= 1) {
        return { success: false, error: 'Cannot unlink your only sign-in method' };
      }
      const remaining = linked.filter((p) => p !== provider);
      await this._oauthAccountRepository.deleteByProviderAndUserId(provider, userId);
      await this._userRepository.update(userId, { oauthProviders: remaining });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unlink account',
      };
    }
  }

  /**
   * Verify JWT token.
   *
   * @param token - JWT token
   * @returns Decoded token data or null if invalid
   */
  public async verifyToken(token: string): Promise<IAuthTokenPayload | null> {
    try {
      const decoded = jwt.verify(token, this._jwtSecret) as {
        userId: string;
        email: string;
        fid?: string;
        role?: string;
        studentId?: string;
      };

      const role: UserRole = decoded.role === 'student' ? 'student' : 'parent';
      return {
        userId: decoded.userId,
        email: decoded.email,
        role,
        fid: decoded.fid,
        ...(role === 'student' &&
        typeof decoded.studentId === 'string' &&
        decoded.studentId.length > 0
          ? { studentId: decoded.studentId }
          : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * Issue a user JWT for a specific user (used for admin impersonation flows).
   *
   * NOTE: This does not perform any permission checks by itself. Callers must
   * enforce RBAC and audit logging at the API layer.
   */
  public issueTokenForUser(userId: string, email: string): string {
    return this._generateToken(userId, email, { role: 'parent' });
  }

  /**
   * Request a password reset. Always returns success to avoid email enumeration.
   * Invalidates any existing reset tokens for the user and sends a fresh link.
   */
  public async requestPasswordReset(email: string): Promise<IRequestPasswordResetResult> {
    if (!this._passwordResetTokenStore || !this._passwordResetEmailSender || !this._baseUrl) {
      return { success: false, error: 'Password reset is not configured' };
    }

    const user = await this._userRepository.findByEmail(email);
    if (!user) {
      return { success: true };
    }

    try {
      const userId = user._id?.toString() ?? '';
      await this._passwordResetTokenStore.invalidateForUser(userId);

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
      await this._passwordResetTokenStore.create(userId, token, expiresAt);

      const resetUrl = `${this._baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
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
   * Reset password using a valid reset token. Invalidates the token after use.
   */
  public async resetPasswordWithToken(
    token: string,
    newPassword: string
  ): Promise<IRequestPasswordResetResult> {
    if (!this._passwordResetTokenStore) {
      return { success: false, error: 'Password reset is not configured' };
    }

    const valid = await this._passwordResetTokenStore.findValidByToken(token);
    if (!valid) {
      return { success: false, error: 'Invalid or expired reset link. Please request a new one.' };
    }

    try {
      const passwordHash = await UserRepo.hashPassword(newPassword);
      await this._userRepository.update(valid.userId, {
        passwordHash,
        forcePasswordReset: false,
      });
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
   * Refresh access token using a valid refresh token. Rotates refresh token (new one issued, old revoked).
   * If the provided token was already revoked, revokes the entire family (reuse attack).
   */
  public async refreshAccessToken(
    refreshToken: string
  ): Promise<IRefreshResult | { error: string }> {
    if (!this._refreshTokenStore) {
      return { error: 'Refresh tokens are not configured' };
    }
    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return { error: 'Invalid refresh token' };
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken.trim()).digest('hex');
    const valid = await this._refreshTokenStore.findValidByTokenHash(tokenHash);
    if (!valid) {
      const existing = await this._refreshTokenStore.findByTokenHash(tokenHash);
      if (existing?.revokedAt) {
        await this._refreshTokenStore.revokeFamily(existing.familyId);
        return { error: 'Refresh token was reused; session revoked' };
      }
      return { error: 'Invalid or expired refresh token' };
    }

    const user = await this._userRepository.findById(valid.userId);
    if (!user) {
      await this._refreshTokenStore.revokeFamily(valid.familyId);
      return { error: 'User no longer exists' };
    }

    await this._refreshTokenStore.revokeByTokenHash(tokenHash);

    const newPair = await this._createRefreshToken(
      valid.userId,
      user.email,
      valid.familyId,
      undefined,
      valid.expiresAt
    );
    if (!newPair) {
      return { error: 'Failed to issue new tokens' };
    }
    const token = this._generateToken(
      valid.userId,
      user.email,
      tokenClaimsFromUser(user, newPair.familyId)
    );
    return { token, refreshToken: newPair.refreshToken, familyId: newPair.familyId };
  }

  /**
   * Revoke a refresh token (logout). Revokes the entire family so all sessions are invalidated.
   */
  public async revokeRefreshToken(
    refreshToken: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._refreshTokenStore) {
      return { success: true };
    }
    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return { success: true };
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken.trim()).digest('hex');
    const existing = await this._refreshTokenStore.findByTokenHash(tokenHash);
    if (existing) {
      await this._refreshTokenStore.revokeFamily(existing.familyId);
    }
    return { success: true };
  }

  /**
   * Mint access + refresh tokens for a verified user.
   */
  private async _issueSession(user: User, rememberMe: boolean): Promise<IAuthResult> {
    const userId = user._id?.toString() ?? '';
    const refreshPair = await this._createRefreshToken(
      userId,
      user.email,
      undefined,
      rememberMe ? undefined : this._sessionRefreshTokenExpiresInMs
    );
    const token = this._generateToken(
      userId,
      user.email,
      tokenClaimsFromUser(user, refreshPair?.familyId)
    );

    return {
      success: true,
      token,
      refreshToken: refreshPair?.refreshToken,
      familyId: refreshPair?.familyId,
      rememberMe,
      user: publicUserFromUser(user),
      forcePasswordReset: user.forcePasswordReset === true,
    };
  }

  /**
   * Create and store a refresh token for the user. Returns access token and raw refresh token.
   * When familyId is provided (rotation), reuse it; otherwise create a new family.
   * When expiresInMsOverride is set (e.g. for session-only), use that instead of default expiry.
   * When expiresAtOverride is set (e.g. on rotation), use that as the new token's expiry.
   */
  private async _createRefreshToken(
    userId: string,
    email: string,
    familyId?: string,
    expiresInMsOverride?: number,
    expiresAtOverride?: Date
  ): Promise<{ token: string; refreshToken: string; familyId: string } | null> {
    if (!this._refreshTokenStore) return null;

    const fid = familyId ?? crypto.randomUUID();
    const refreshTokenRaw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const expiresAt =
      expiresAtOverride ??
      new Date(Date.now() + (expiresInMsOverride ?? this._refreshTokenExpiresInMs));

    await this._refreshTokenStore.create(userId, tokenHash, fid, expiresAt);
    const token = this._generateToken(userId, email, { role: 'parent' });
    return { token, refreshToken: refreshTokenRaw, familyId: fid };
  }

  /**
   * Generate JWT token. Includes role (default parent) and optional studentId / familyId.
   */
  private _generateToken(
    userId: string,
    email: string,
    claims?: { familyId?: string; role?: UserRole; studentId?: string }
  ): string {
    const role: UserRole = claims?.role === 'student' ? 'student' : 'parent';
    const payload: {
      userId: string;
      email: string;
      role: UserRole;
      fid?: string;
      studentId?: string;
    } = { userId, email, role };
    if (claims?.familyId) payload.fid = claims.familyId;
    if (role === 'student' && claims?.studentId) payload.studentId = claims.studentId;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return jwt.sign(
      payload,
      this._jwtSecret,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      { expiresIn: this._jwtExpiresIn } as jwt.SignOptions
    ) as string;
  }
}
