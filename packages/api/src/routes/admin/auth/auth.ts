import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import jwt from 'jsonwebtoken';
import { AdminAuthService, MFAService } from '@scholaracle/auth';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
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
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleMFAVerify(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  try {
    const { mfaToken, token } = req.body;

    if (!mfaToken || !token) {
      res.status(400).json({
        success: false,
        error: 'MFA token and TOTP code are required',
      });
      return;
    }

    const result = await adminAuthService.verifyMFAToken(mfaToken, token);

    if (!result.success) {
      res.status(401).json({
        success: false,
        error: result.error,
      });
      return;
    }

    if (result.token) {
      await createAdminSession(sessionRepository, result.token, req);
    }
    res.status(200).json({
      success: true,
      token: result.token,
      admin: result.admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleMFASetupData(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  try {
    const { mfaSetupToken } = req.body as { mfaSetupToken?: string };

    if (!mfaSetupToken || typeof mfaSetupToken !== 'string') {
      res.status(400).json({
        success: false,
        error: 'mfaSetupToken is required',
      });
      return;
    }

    const result = await adminAuthService.getMFASetupData(mfaSetupToken);

    if ('error' in result) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      qrCodeUrl: result.qrCodeUrl,
      manualEntryKey: result.manualEntryKey,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleMFACompleteSetup(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  try {
    const { mfaSetupToken, totpToken } = req.body as { mfaSetupToken?: string; totpToken?: string };

    if (!mfaSetupToken || !totpToken) {
      res.status(400).json({
        success: false,
        error: 'mfaSetupToken and totpToken are required',
      });
      return;
    }

    const result = await adminAuthService.completeMFASetup(mfaSetupToken, totpToken);

    if (!result.success) {
      res.status(401).json({
        success: false,
        error: result.error,
      });
      return;
    }

    if (result.token) {
      await createAdminSession(sessionRepository, result.token, req);
    }
    res.status(200).json({
      success: true,
      token: result.token,
      admin: result.admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleMFASetup(
  req: Request,
  res: Response,
  _adminAuthService: AdminAuthService,
  mfaService: MFAService
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    const adminId = authReq.adminId;
    const adminEmail = authReq.adminEmail;

    if (!adminId || !adminEmail) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleMFAEnable(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  auditLogRepo: AuditLogRepository,
  mfaService: MFAService
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    const adminId = authReq.adminId;
    const adminEmail = authReq.adminEmail;
    if (!adminId || !adminEmail) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { secret, token } = req.body as { secret?: string; token?: string };
    if (!secret || !token) {
      res.status(400).json({ success: false, error: 'secret and token are required' });
      return;
    }

    const ok = mfaService.verifyToken(secret, token);
    if (!ok) {
      res.status(401).json({ success: false, error: 'Invalid MFA code' });
      return;
    }

    const updated = await adminRepo.update(adminId, { mfaEnabled: true, mfaSecret: secret });
    if (!updated) {
      res.status(404).json({ success: false, error: 'Admin not found' });
      return;
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
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function handleStepUpStart(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  stepUpStore: IAdminStepUpChallengeStore
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    if (!authReq.adminId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const admin = await adminRepo.findById(authReq.adminId);
    if (!admin || !admin.isActive) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (!admin.mfaEnabled || !admin.mfaSecret) {
      res.status(400).json({ success: false, error: 'MFA is not enabled for this admin' });
      return;
    }

    const stepUpId = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await stepUpStore.create(stepUpId, authReq.adminId, new Date(expiresAt));
    res.status(200).json({ success: true, data: { stepUpId, expiresAt } });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function handleStepUpVerify(
  req: Request,
  res: Response,
  adminRepo: AdminUserRepository,
  mfaService: MFAService,
  adminAuthService: AdminAuthService,
  stepUpStore: IAdminStepUpChallengeStore
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    if (!authReq.adminId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { stepUpId, token } = req.body as { stepUpId?: string; token?: string };
    if (!stepUpId || !token) {
      res.status(400).json({ success: false, error: 'stepUpId and token are required' });
      return;
    }

    const record = await stepUpStore.get(stepUpId);
    if (!record || record.adminId !== authReq.adminId) {
      res.status(401).json({ success: false, error: 'Invalid step-up challenge' });
      return;
    }

    const admin = await adminRepo.findById(authReq.adminId);
    if (!admin || !admin.isActive || !admin.mfaEnabled || !admin.mfaSecret) {
      res.status(401).json({ success: false, error: 'MFA is not enabled' });
      return;
    }

    const ok = mfaService.verifyToken(admin.mfaSecret, token);
    if (!ok) {
      res.status(401).json({ success: false, error: 'Invalid MFA code' });
      return;
    }

    await stepUpStore.delete(stepUpId);

    const stepUpToken = await adminAuthService.issueStepUpToken(authReq.adminId);
    if (!stepUpToken) {
      res.status(401).json({ success: false, error: 'MFA is not enabled' });
      return;
    }

    res.status(200).json({ success: true, data: { stepUpToken } });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

async function handleAdminForgotPassword(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  try {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: email',
      });
      return;
    }

    const result = await adminAuthService.requestPasswordReset(email.trim());

    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleAdminResetPassword(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };

    if (!token || !newPassword || typeof newPassword !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: token, newPassword',
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
      });
      return;
    }

    const result = await adminAuthService.resetPasswordWithToken(token, newPassword);

    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleLogout(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService,
  sessionRepository?: ISessionRepository
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing authorization header',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleRefresh(
  req: Request,
  res: Response,
  adminAuthService: AdminAuthService
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);
    const result = await adminAuthService.refreshToken(token);

    if (!result.success) {
      res.status(401).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      token: result.token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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
    (req: Request, res: Response) => {
    void handleLogin(req, res, adminAuthService);
    }
  );

  router.post('/mfa/verify', (req: Request, res: Response) => {
    void handleMFAVerify(req, res, adminAuthService, config.sessionRepository);
  });

  router.post('/mfa/setup-data', (req: Request, res: Response) => {
    void handleMFASetupData(req, res, adminAuthService);
  });

  router.post('/mfa/complete-setup', (req: Request, res: Response) => {
    void handleMFACompleteSetup(req, res, adminAuthService, config.sessionRepository);
  });

  router.post('/mfa/setup', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleMFASetup(req, res, adminAuthService, mfaService);
  });

  router.post('/mfa/enable', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleMFAEnable(req, res, adminRepo, auditLogRepo, mfaService);
  });

  router.post('/step-up/start', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void (stepUpStore
      ? handleStepUpStart(req, res, adminRepo, stepUpStore)
      : Promise.resolve().then(() => {
          res.status(503).json({ success: false, error: 'Step-up challenges not configured' });
        }));
  });

  router.post('/step-up/verify', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void (stepUpStore
      ? handleStepUpVerify(req, res, adminRepo, mfaService, adminAuthService, stepUpStore)
      : Promise.resolve().then(() => {
          res.status(503).json({ success: false, error: 'Step-up challenges not configured' });
        }));
  });

  router.post('/forgot-password', (req: Request, res: Response) => {
    void handleAdminForgotPassword(req, res, adminAuthService);
  });

  router.post('/reset-password', (req: Request, res: Response) => {
    void handleAdminResetPassword(req, res, adminAuthService);
  });

  router.post('/logout', (req: Request, res: Response) => {
    void handleLogout(req, res, adminAuthService, config.sessionRepository);
  });

  router.post('/refresh', (req: Request, res: Response) => {
    void handleRefresh(req, res, adminAuthService);
  });

  return router;
}

