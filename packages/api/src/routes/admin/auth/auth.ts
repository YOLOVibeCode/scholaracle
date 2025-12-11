import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService, MFAService } from '@scholaracle/auth';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';

export interface IAdminAuthRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
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

  router.post('/login', (req: Request, res: Response) => {
    void handleLogin(req, res, adminAuthService);
  });

  router.post('/mfa/verify', (req: Request, res: Response) => {
    void handleMFAVerify(req, res, adminAuthService);
  });

  router.post('/mfa/setup', adminAuthMiddleware(adminAuthService), (req: Request, res: Response) => {
    void handleMFASetup(req, res, adminAuthService, mfaService);
  });

  router.post('/logout', (req: Request, res: Response) => {
    void handleLogout(req, res, adminAuthService);
  });

  router.post('/refresh', (req: Request, res: Response) => {
    void handleRefresh(req, res, adminAuthService);
  });

  return router;
}

