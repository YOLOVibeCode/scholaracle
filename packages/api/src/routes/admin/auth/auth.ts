import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import jwt from 'jsonwebtoken';
import { AdminAuthService, MFAService } from '@scholaracle/auth';
import { AuthenticationError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import {
  AdminUserRepository,
  AdminPasswordResetTokenRepository,
  AuditLogRepository,
  type IAdminRevokedTokenStore,
  type IAdminMFATokenStore,
  type IAdminStepUpChallengeStore,
  type ISessionRepository,
} from '@scholaracle/database';
import type { IPasswordResetEmailSender } from '@scholaracle/auth';
import crypto from 'crypto';
import { MemoryRateLimiter, rateLimitMiddleware } from '../../../middleware/rateLimit';
import { parseUserAgent } from '../../../utils/parseUserAgent';

export interface IAdminAuthRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly revokedTokenStore?: IAdminRevokedTokenStore;
  readonly mfaTokenStore?: IAdminMFATokenStore;
  readonly stepUpChallengeStore?: IAdminStepUpChallengeStore;
  readonly adminPasswordResetTokenStore?: InstanceType<typeof AdminPasswordResetTokenRepository>;
  readonly adminPasswordResetEmailSender?: IPasswordResetEmailSender;
  readonly adminBaseUrl?: string;
  readonly sessionRepository?: ISessionRepository;
}

function getIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    ''
  );
}

async function createAdminSession(
  sessionRepository: ISessionRepository | undefined,
  token: string,
  req: Request
): Promise<void> {
  if (!sessionRepository) return;
  const decoded = jwt.decode(token) as { adminId?: string; jti?: string } | null;
  if (!decoded?.adminId || !decoded.jti) return;
  const deviceInfo = parseUserAgent(req.headers['user-agent']);
  const ipAddress = getIp(req);
  const now = new Date();
  await sessionRepository.create({
    userId: decoded.adminId,
    userType: 'admin',
    refreshTokenFamilyId: decoded.jti,
    deviceInfo,
    ipAddress,
    lastActiveAt: now,
  });
}

async function handleLogin(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const result = await adminAuthService.login(email, password);

  if (!result.success) {
    res.status(401).json({
      success: false,
      error: result.error,
      requiresMFA: result.requiresMFA,
      mfaToken: result.mfaToken,
      requiresMFASetup: result.requiresMFASetup,
      mfaSetupToken: result.mfaSetupToken,
    });
    return;
  }

  res.status(200).json({
    success: true,
    token: result.token,
    admin: result.admin,
  });
}

async function handleMFAVerify(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const { mfaToken, token } = req.body;

  if (!mfaToken || !token) {
    throw new ValidationError('MFA token and TOTP code are required');
  }

  const result = await adminAuthService.verifyMFAToken(mfaToken, token);

  if (!result.success) {
    throw new AuthenticationError(result.error);
  }

  if (result.token) {
    await createAdminSession(sessionRepository, result.token, req);
  }
  res.status(200).json({
    success: true,
    token: result.token,
    admin: result.admin,
  });
}

async function handleMFASetupData(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  const { mfaSetupToken } = req.body as { mfaSetupToken?: string };

  if (!mfaSetupToken || typeof mfaSetupToken !== 'string') {
    throw new ValidationError('mfaSetupToken is required');
  }

  const result = await adminAuthService.getMFASetupData(mfaSetupToken);

  if ('error' in result) {
    throw new ValidationError(result.error);
  }

  res.status(200).json({
    success: true,
    qrCodeUrl: result.qrCodeUrl,
    manualEntryKey: result.manualEntryKey,
  });
}

async function handleMFACompleteSetup(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const { mfaSetupToken, totpToken } = req.body as { mfaSetupToken?: string; totpToken?: string };

  if (!mfaSetupToken || !totpToken) {
    throw new ValidationError('mfaSetupToken and totpToken are required');
  }

  const result = await adminAuthService.completeMFASetup(mfaSetupToken, totpToken);

  if (!result.success) {
    throw new AuthenticationError(result.error);
  }

  if (result.token) {
    await createAdminSession(sessionRepository, result.token, req);
  }
  res.status(200).json({
    success: true,
    token: result.token,
    admin: result.admin,
  });
}

async function handleMFASetup(
  req: Request,
  res: Response,
  _adminAuthService: AdminAuthService,
  mfaService: MFAService
): Promise<void> {
  const authReq = req as IAdminAuthenticatedRequest;
  const adminId = authReq.adminId;
  const adminEmail = authReq.adminEmail;

  if (!adminId || !adminEmail) {
    throw new AuthenticationError('Unauthorized');
  }

  // Generate MFA secret
  const setupResult = mfaService.generateSecret(adminEmail);
  const qrCodeUrl = await mfaService.generateQRCode(setupResult.qrCodeUrl);

  res.status(200).json({
    success: true,
    secret: setupResult.secret,
    qrCodeUrl,
    manualEntryKey: setupResult.manualEntryKey,
  });
}

async function handleMFAEnable(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  auditLogRepo: AuditLogRepository,
  mfaService: MFAService
): Promise<void> {
  const authReq = req as IAdminAuthenticatedRequest;
  const adminId = authReq.adminId;
  const adminEmail = authReq.adminEmail;
  if (!adminId || !adminEmail) {
    throw new AuthenticationError('Unauthorized');
  }

  const { secret, token } = req.body as { secret?: string; token?: string };
  if (!secret || !token) {
    throw new ValidationError('secret and token are required');
  }

  const ok = mfaService.verifyToken(secret, token);
  if (!ok) {
    throw new AuthenticationError('Invalid MFA code');
  }

  const updated = await adminRepo.update(adminId, { mfaEnabled: true, mfaSecret: secret });
  if (!updated) {
    throw new NotFoundError('Admin not found');
  }

  await auditLogRepo.create({
    adminUserId: adminId,
    adminEmail,
    action: 'admin:mfa_setup',
    entityType: 'admin_user',
    entityId: adminId,
    reason: 'Enabled MFA',
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  res.status(200).json({ success: true });
}

async function handleStepUpStart(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  stepUpStore: IAdminStepUpChallengeStore
): Promise<void> {
  const authReq = req as IAdminAuthenticatedRequest;
  if (!authReq.adminId) {
    throw new AuthenticationError('Unauthorized');
  }

  const admin = await adminRepo.findById(authReq.adminId);
  if (!admin || !admin.isActive) {
    throw new AuthenticationError('Unauthorized');
  }
  if (!admin.mfaEnabled || !admin.mfaSecret) {
    throw new ValidationError('MFA is not enabled for this admin');
  }

  const stepUpId = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await stepUpStore.create(stepUpId, authReq.adminId, new Date(expiresAt));
  res.status(200).json({ success: true, data: { stepUpId, expiresAt } });
}

async function handleStepUpVerify(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  mfaService: MFAService,
  adminAuthService: AdminAuthService,
  stepUpStore: IAdminStepUpChallengeStore
): Promise<void> {
  const authReq = req as IAdminAuthenticatedRequest;
  if (!authReq.adminId) {
    throw new AuthenticationError('Unauthorized');
  }

  const { stepUpId, token } = req.body as { stepUpId?: string; token?: string };
  if (!stepUpId || !token) {
    throw new ValidationError('stepUpId and token are required');
  }

  const record = await stepUpStore.get(stepUpId);
  if (!record || record.adminId !== authReq.adminId) {
    throw new AuthenticationError('Invalid step-up challenge');
  }

  const admin = await adminRepo.findById(authReq.adminId);
  if (!admin || !admin.isActive || !admin.mfaEnabled || !admin.mfaSecret) {
    throw new AuthenticationError('MFA is not enabled');
  }

  const ok = mfaService.verifyToken(admin.mfaSecret, token);
  if (!ok) {
    throw new AuthenticationError('Invalid MFA code');
  }

  await stepUpStore.delete(stepUpId);

  const stepUpToken = await adminAuthService.issueStepUpToken(authReq.adminId);
  if (!stepUpToken) {
    throw new AuthenticationError('MFA is not enabled');
  }

  res.status(200).json({ success: true, data: { stepUpToken } });
}

async function handleAdminForgotPassword(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new ValidationError('Missing required field: email');
  }

  const result = await adminAuthService.requestPasswordReset(email.trim());

  if (result.success) {
    res.status(200).json({ success: true });
  } else {
    res.status(500).json(result);
  }
}

async function handleAdminResetPassword(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword || typeof newPassword !== 'string') {
    throw new ValidationError('Missing required fields: token, newPassword');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const result = await adminAuthService.resetPasswordWithToken(token, newPassword);

  if (result.success) {
    res.status(200).json({ success: true });
  } else {
    res.status(400).json(result);
  }
}

async function handleLogout(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.substring(7);
  if (sessionRepository) {
    const decoded = jwt.decode(token) as { adminId?: string; jti?: string } | null;
    if (decoded?.adminId && decoded.jti) {
      await sessionRepository.revokeByFamilyId(decoded.adminId, 'admin', decoded.jti);
    }
  }
  const success = await adminAuthService.logout(token);

  res.status(200).json({
    success,
  });
}

async function handleRefresh(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.substring(7);
  const result = await adminAuthService.refreshToken(token);

  if (!result.success) {
    throw new AuthenticationError(result.error);
  }

  res.status(200).json({
    success: true,
    token: result.token,
  });
}

export function adminAuthRouter(config: IAdminAuthRouterConfig): Router {
  const router = Router();
  const adminAuthService = new AdminAuthService(
    config.database,
    config.jwtSecret,
    undefined,
    undefined,
    config.revokedTokenStore,
    config.mfaTokenStore,
    config.adminPasswordResetTokenStore,
    config.adminPasswordResetEmailSender,
    config.adminBaseUrl
  );
  const mfaService = new MFAService();
  const adminRepo = new AdminUserRepository(config.database);
  const auditLogRepo = new AuditLogRepository(config.database);
  const stepUpStore = config.stepUpChallengeStore;
  const limiter = new MemoryRateLimiter();
  const rateLimitEnabled = process.env['RATE_LIMIT_ENABLED'] === 'true';

  router.post(
    '/login',
    rateLimitMiddleware({
      limiter,
      enabled: rateLimitEnabled,
      windowMs: 60_000,
      max: 10,
      keyPrefix: 'admin:auth:login',
    }),
    asyncHandler((req: Request, res: Response) => handleLogin(req, res, adminAuthService))
  );

  router.post(
    '/mfa/verify',
    asyncHandler((req: Request, res: Response) =>
      handleMFAVerify(req, res, adminAuthService, config.sessionRepository)
    )
  );

  router.post(
    '/mfa/setup-data',
    asyncHandler((req: Request, res: Response) => handleMFASetupData(req, res, adminAuthService))
  );

  router.post(
    '/mfa/complete-setup',
    asyncHandler((req: Request, res: Response) =>
      handleMFACompleteSetup(req, res, adminAuthService, config.sessionRepository)
    )
  );

  router.post(
    '/mfa/setup',
    adminAuthMiddleware(adminAuthService),
    asyncHandler((req: Request, res: Response) =>
      handleMFASetup(req, res, adminAuthService, mfaService)
    )
  );

  router.post(
    '/mfa/enable',
    adminAuthMiddleware(adminAuthService),
    asyncHandler((req: Request, res: Response) =>
      handleMFAEnable(req, res, adminRepo, auditLogRepo, mfaService)
    )
  );

  router.post(
    '/step-up/start',
    adminAuthMiddleware(adminAuthService),
    asyncHandler(async (req: Request, res: Response) => {
      if (!stepUpStore) {
        res.status(503).json({ success: false, error: 'Step-up challenges not configured' });
        return;
      }
      await handleStepUpStart(req, res, adminRepo, stepUpStore);
    })
  );

  router.post(
    '/step-up/verify',
    adminAuthMiddleware(adminAuthService),
    asyncHandler(async (req: Request, res: Response) => {
      if (!stepUpStore) {
        res.status(503).json({ success: false, error: 'Step-up challenges not configured' });
        return;
      }
      await handleStepUpVerify(req, res, adminRepo, mfaService, adminAuthService, stepUpStore);
    })
  );

  router.post(
    '/forgot-password',
    asyncHandler((req: Request, res: Response) =>
      handleAdminForgotPassword(req, res, adminAuthService)
    )
  );

  router.post(
    '/reset-password',
    asyncHandler((req: Request, res: Response) =>
      handleAdminResetPassword(req, res, adminAuthService)
    )
  );

  router.post(
    '/logout',
    asyncHandler((req: Request, res: Response) =>
      handleLogout(req, res, adminAuthService, config.sessionRepository)
    )
  );

  router.post(
    '/refresh',
    asyncHandler((req: Request, res: Response) => handleRefresh(req, res, adminAuthService))
  );

  return router;
}
