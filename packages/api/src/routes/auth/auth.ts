import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'node:crypto';
import { AuthService, type IPasswordResetEmailSender } from '@scholaracle/auth';
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
  type IAuthLoginResponse,
  type IAuthRefreshResponse,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type {
  IPasswordResetTokenStore,
  IRefreshTokenStore,
  IOAuthAccountRepository,
} from '@scholaracle/database';
import type { ISessionRepository } from '@scholaracle/database';
import { parseUserAgent } from '../../utils/parseUserAgent';

/** In-memory rate limit for forgot-password: key -> { count, resetAt } */
const forgotPasswordRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_PER_EMAIL = 5;
const RATE_LIMIT_PER_IP = 20;

function cleanStaleRateLimit(now: number): void {
  for (const [k, v] of forgotPasswordRateLimit.entries()) {
    if (v.resetAt < now) forgotPasswordRateLimit.delete(k);
  }
}

function getOrInitRateLimitEntry(key: string, now: number): { count: number; resetAt: number } {
  let entry = forgotPasswordRateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    forgotPasswordRateLimit.set(key, entry);
  }
  return entry;
}

function checkForgotPasswordRateLimit(email: string, ip: string): boolean {
  const now = Date.now();
  cleanStaleRateLimit(now);

  const emailKey = `email:${email.toLowerCase().trim()}`;
  const ipKey = `ip:${ip || 'unknown'}`;

  const getOrInit = (key: string): { count: number; resetAt: number } =>
    getOrInitRateLimitEntry(key, now);

  const emailEntry = getOrInit(emailKey);
  const ipEntry = getOrInit(ipKey);
  if (emailEntry.count >= RATE_LIMIT_PER_EMAIL || ipEntry.count >= RATE_LIMIT_PER_IP) {
    return false;
  }
  emailEntry.count += 1;
  ipEntry.count += 1;
  return true;
}

/** Max age for refresh_token cookie when rememberMe is true (30 days in seconds). */
const REFRESH_COOKIE_MAX_AGE_30D = 30 * 24 * 60 * 60;
/** Max age for refresh_token cookie when rememberMe is false (24h in seconds). */
const REFRESH_COOKIE_MAX_AGE_24H = 24 * 60 * 60;

function setRefreshTokenCookie(res: Response, refreshToken: string, rememberMe: boolean): void {
  const maxAgeSec = rememberMe ? REFRESH_COOKIE_MAX_AGE_30D : REFRESH_COOKIE_MAX_AGE_24H;
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    maxAge: maxAgeSec * 1000,
    path: '/',
  });
}

function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie('refresh_token', { path: '/', httpOnly: true });
}

export interface IAuthRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly jwtExpiresIn?: string;
  readonly passwordResetTokenStore?: IPasswordResetTokenStore;
  readonly passwordResetEmailSender?: IPasswordResetEmailSender;
  readonly baseUrl?: string;
  readonly refreshTokenStore?: IRefreshTokenStore;
  readonly refreshTokenExpiresIn?: string;
  readonly sessionRefreshTokenExpiresIn?: string;
  readonly sessionRepository?: ISessionRepository;
  readonly oauthAccountRepository?: IOAuthAccountRepository;
  /** If provided, use this AuthService instead of creating one from config. */
  readonly authService?: AuthService;
}

function getIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    ''
  );
}

/**
 * Create or update session after auth success (register, login, refresh).
 */
async function upsertSession(
  sessionRepository: ISessionRepository | undefined,
  userId: string,
  familyId: string | undefined,
  req: Request
): Promise<void> {
  if (!sessionRepository || !familyId) return;
  const deviceInfo = parseUserAgent(req.headers['user-agent']);
  const ipAddress = getIp(req);
  const now = new Date();
  const existing = await sessionRepository.findByFamilyId(userId, 'user', familyId);
  if (existing) {
    await sessionRepository.updateLastActive(existing._id.toString());
  } else {
    await sessionRepository.create({
      userId,
      userType: 'user',
      refreshTokenFamilyId: familyId,
      deviceInfo,
      ipAddress,
      lastActiveAt: now,
    });
  }
}

/**
 * Handle register request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param authService - Auth service
 * @param sessionRepository - Optional session repository for multi-device tracking
 */
async function handleRegister(
  req: Request,
  res: Response,
  authService: AuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const { email, password, name, phone, smsConsent, rememberMe } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    phone?: string;
    smsConsent?: boolean;
    rememberMe?: boolean;
  };

  if (!email || !password || !name) {
    throw new ValidationError('Missing required fields: email, password, name');
  }

  const result = await authService.register(email, password, name, {
    phone: phone || undefined,
    smsConsent: smsConsent === true,
    rememberMe: rememberMe !== false,
  });

  if (result.success && result.user?.id && result.familyId) {
    await upsertSession(sessionRepository, result.user.id, result.familyId, req);
  }
  if (result.success) {
    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken, result.rememberMe !== false);
    }
    res.status(201).json(result);
  } else {
    res.status(400).json(result);
  }
}

/**
 * Handle login request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param authService - Auth service
 */
async function handleLogin(
  req: Request,
  res: Response,
  authService: AuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const { email, password, rememberMe } = req.body as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  };

  if (!email || !password) {
    throw new ValidationError('Missing required fields: email, password');
  }

  const result = await authService.login(email, password, {
    rememberMe: rememberMe !== false,
  });

  if (result.success && result.user?.id && result.familyId) {
    await upsertSession(sessionRepository, result.user.id, result.familyId, req);
  }
  if (result.success) {
    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken, result.rememberMe !== false);
    }
    res.status(200).json(result satisfies IAuthLoginResponse);
  } else {
    res.status(401).json(result);
  }
}

/**
 * Handle forgot-password request.
 */
async function handleForgotPassword(
  req: Request,
  res: Response,
  authService: AuthService
): Promise<void> {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new ValidationError('Missing required field: email');
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    '';
  if (!checkForgotPasswordRateLimit(email.trim(), ip)) {
    throw new RateLimitError('Too many reset requests. Please try again later.');
  }

  const result = await authService.requestPasswordReset(email.trim());

  if (result.success) {
    res.status(200).json({ success: true });
  } else {
    res.status(500).json(result);
  }
}

/**
 * Handle reset-password request.
 */
async function handleResetPassword(
  req: Request,
  res: Response,
  authService: AuthService
): Promise<void> {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword || typeof newPassword !== 'string') {
    throw new ValidationError('Missing required fields: token, newPassword');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const result = await authService.resetPasswordWithToken(token, newPassword);

  if (result.success) {
    res.status(200).json({ success: true });
  } else {
    res.status(400).json(result);
  }
}

/**
 * Handle refresh token request.
 * Accepts refresh token from httpOnly cookie (preferred) or body.
 * Accepts rememberMe in body so cookie max-age can be set correctly (default true).
 */
async function handleRefresh(
  req: Request,
  res: Response,
  authService: AuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const refreshToken =
    (req.cookies?.['refresh_token'] as string | undefined) ??
    (req.body as { refreshToken?: string }).refreshToken;
  const rememberMe = (req.body as { rememberMe?: boolean }).rememberMe !== false;

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new ValidationError('Missing required field: refreshToken');
  }

  const result = await authService.refreshAccessToken(refreshToken);

  if ('error' in result) {
    throw new AuthenticationError(result.error);
  }

  if (sessionRepository && result.familyId) {
    const payload = await authService.verifyToken(result.token);
    if (payload) {
      await upsertSession(sessionRepository, payload.userId, result.familyId, req);
    }
  }

  if (result.refreshToken) {
    setRefreshTokenCookie(res, result.refreshToken, rememberMe);
  }
  res.status(200).json({
    success: true,
    token: result.token,
    refreshToken: result.refreshToken,
    rememberMe,
  } satisfies IAuthRefreshResponse);
}

function validateOAuthSecret(req: Request): boolean {
  const secret =
    req.headers['x-internal-api-secret'] ??
    req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  const expected = process.env['INTERNAL_API_SECRET'];
  return Boolean(expected && secret === expected);
}

function validateOAuthPayload(body: unknown):
  | {
      ok: true;
      provider: 'google' | 'apple' | 'microsoft';
      providerAccountId: string;
      email: string;
      name: string;
    }
  | { ok: false; error: string } {
  const b = body as {
    provider?: string;
    providerAccountId?: string;
    email?: string;
    name?: string;
  };
  const { provider, providerAccountId, email, name } = b;
  if (!provider || !providerAccountId || !email || !name) {
    return {
      ok: false,
      error: 'Missing required fields: provider, providerAccountId, email, name',
    };
  }
  const validProviders = ['google', 'apple', 'microsoft'];
  if (!validProviders.includes(provider)) {
    return { ok: false, error: 'Invalid provider' };
  }
  return {
    ok: true,
    provider: provider as 'google' | 'apple' | 'microsoft',
    providerAccountId,
    email,
    name,
  };
}

/**
 * Handle OAuth callback from Next.js server (internal).
 * Validates INTERNAL_API_SECRET header; finds/creates user and issues JWT tokens.
 */
async function handleOAuth(
  req: Request,
  res: Response,
  authService: AuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  if (!validateOAuthSecret(req)) {
    throw new AuthenticationError('Unauthorized');
  }
  const payload = validateOAuthPayload(req.body);
  if (!payload.ok) {
    throw new ValidationError(payload.error);
  }
  const result = await authService.loginOrRegisterOAuth(
    payload.provider,
    payload.providerAccountId,
    payload.email,
    payload.name
  );
  if (result.success && result.user?.id && result.familyId) {
    await upsertSession(sessionRepository, result.user.id, result.familyId, req);
  }
  if (result.success) {
    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken, result.rememberMe !== false);
    }
    res.status(200).json(result);
  } else {
    res.status(400).json(result);
  }
}

/**
 * Handle logout request (revoke refresh token and session).
 * Accepts refresh token from httpOnly cookie or body.
 */
async function handleLogout(
  req: Request,
  res: Response,
  authService: AuthService,
  sessionRepository?: ISessionRepository,
  refreshTokenStore?: IRefreshTokenStore
): Promise<void> {
  const refreshToken =
    (req.cookies?.['refresh_token'] as string | undefined) ??
    (req.body as { refreshToken?: string }).refreshToken;

  if (refreshToken && typeof refreshToken === 'string') {
    if (sessionRepository && refreshTokenStore) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken.trim()).digest('hex');
      const existing = await refreshTokenStore.findByTokenHash(tokenHash);
      if (existing) {
        await sessionRepository.revokeByFamilyId(existing.userId, 'user', existing.familyId);
      }
    }
    await authService.revokeRefreshToken(refreshToken);
  }

  clearRefreshTokenCookie(res);
  res.status(200).json({ success: true });
}

/**
 * Create auth router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function authRouter(config: IAuthRouterConfig): Router {
  const router = Router();
  const authService =
    config.authService ??
    new AuthService(
      config.database,
      config.jwtSecret,
      config.jwtExpiresIn,
      config.passwordResetTokenStore,
      config.passwordResetEmailSender,
      config.baseUrl,
      config.refreshTokenStore,
      config.refreshTokenExpiresIn,
      config.sessionRefreshTokenExpiresIn,
      config.oauthAccountRepository
    );

  /**
   * POST /api/auth/register
   * Register a new user.
   */
  router.post(
    '/register',
    asyncHandler((req: Request, res: Response) =>
      handleRegister(req, res, authService, config.sessionRepository)
    )
  );

  /**
   * POST /api/auth/login
   * Login user.
   */
  router.post(
    '/login',
    asyncHandler((req: Request, res: Response) =>
      handleLogin(req, res, authService, config.sessionRepository)
    )
  );

  /**
   * POST /api/auth/oauth
   * Internal: called by Next.js after OAuth callback to issue JWT tokens.
   * Requires x-internal-api-secret or Authorization: Bearer <INTERNAL_API_SECRET>.
   */
  router.post(
    '/oauth',
    asyncHandler((req: Request, res: Response) =>
      handleOAuth(req, res, authService, config.sessionRepository)
    )
  );

  /**
   * POST /api/auth/forgot-password
   * Request a password reset email (always returns success to avoid enumeration).
   */
  router.post(
    '/forgot-password',
    asyncHandler((req: Request, res: Response) => handleForgotPassword(req, res, authService))
  );

  /**
   * POST /api/auth/reset-password
   * Reset password using token from email link.
   */
  router.post(
    '/reset-password',
    asyncHandler((req: Request, res: Response) => handleResetPassword(req, res, authService))
  );

  /**
   * POST /api/auth/refresh
   * Exchange refresh token for new access and refresh tokens.
   */
  router.post(
    '/refresh',
    asyncHandler((req: Request, res: Response) =>
      handleRefresh(req, res, authService, config.sessionRepository)
    )
  );

  /**
   * POST /api/auth/logout
   * Revoke refresh token (logout).
   */
  router.post(
    '/logout',
    asyncHandler((req: Request, res: Response) =>
      handleLogout(req, res, authService, config.sessionRepository, config.refreshTokenStore)
    )
  );

  return router;
}
