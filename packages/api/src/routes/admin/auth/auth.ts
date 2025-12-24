import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService, MFAService } from '@scholaracle/auth';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
import { AdminUserRepository, AuditLogRepository } from '@scholaracle/database';
import crypto from 'crypto';
import { MemoryRateLimiter, rateLimitMiddleware } from '../../../middleware/rateLimit';

export interface IAdminAuthRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

type StepUpRecord = { adminId: string; expiresAt: number };
const stepUpChallenges = new Map<string, StepUpRecord>();

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
  adminAuthService: AdminAuthService
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

async function handleStepUpStart(req: Request, res: Response, adminRepo: AdminUserRepository): Promise<void> {
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
    stepUpChallenges.set(stepUpId, { adminId: authReq.adminId, expiresAt });
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
  adminAuthService: AdminAuthService
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

    const record = stepUpChallenges.get(stepUpId);
    if (!record || record.adminId !== authReq.adminId) {
      res.status(401).json({ success: false, error: 'Invalid step-up challenge' });
      return;
    }
    if (Date.now() > record.expiresAt) {
      stepUpChallenges.delete(stepUpId);
      res.status(401).json({ success: false, error: 'Step-up challenge expired' });
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

    stepUpChallenges.delete(stepUpId);

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

async function handleLogout(
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
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const mfaService = new MFAService();
  const adminRepo = new AdminUserRepository(config.database);
  const auditLogRepo = new AuditLogRepository(config.database);
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
    void handleMFAVerify(req, res, adminAuthService);
  });

  router.post('/mfa/setup', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleMFASetup(req, res, adminAuthService, mfaService);
  });

  router.post('/mfa/enable', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleMFAEnable(req, res, adminRepo, auditLogRepo, mfaService);
  });

  router.post('/step-up/start', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleStepUpStart(req, res, adminRepo);
  });

  router.post('/step-up/verify', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleStepUpVerify(req, res, adminRepo, mfaService, adminAuthService);
  });

  router.post('/logout', (req: Request, res: Response) => {
    void handleLogout(req, res, adminAuthService);
  });

  router.post('/refresh', (req: Request, res: Response) => {
    void handleRefresh(req, res, adminAuthService);
  });

  return router;
}

