import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';
import type { IAdminAuthenticatedRequest } from './adminAuth';
import { AdminAuthService } from '@scholaracle/auth';

export interface IAdminStepUpPayload {
  readonly adminId: string;
  readonly type: 'step_up';
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface IAdminStepUpOptions {
  readonly database: Db;
  readonly jwtSecret?: string;
  /**
   * Max age for a step-up token, in ms. Defaults to 5 minutes.
   */
  readonly maxAgeMs?: number;
}

/**
 * Enforce step-up MFA ONLY when the admin has MFA enabled.
 * If MFA is not enabled for the admin account, this middleware is a no-op.
 *
 * Client supplies: header `x-admin-stepup: <jwt>`.
 */
export function requireAdminStepUp(options: IAdminStepUpOptions) {
  const repo = new AdminUserRepository(options.database);
  const adminAuthService = new AdminAuthService(options.database, options.jwtSecret);
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as IAdminAuthenticatedRequest;
      const adminId = authReq.adminId;
      if (!adminId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const admin = await repo.findById(adminId);
      if (!admin || !admin.isActive) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // Only enforce step-up if MFA is enabled for this admin.
      if (!admin.mfaEnabled || !admin.mfaSecret) {
        next();
        return;
      }

      const token =
        (req.headers['x-admin-stepup'] as string | undefined) ??
        (req.headers['x-admin-step-up'] as string | undefined);

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'MFA step-up required',
          code: 'MFA_STEP_UP_REQUIRED',
        });
        return;
      }

      const decoded = (await adminAuthService.verifyStepUpToken(
        token
      )) as IAdminStepUpPayload | null;
      if (!decoded || decoded.type !== 'step_up' || decoded.adminId !== adminId) {
        res
          .status(401)
          .json({ success: false, error: 'Invalid step-up token', code: 'MFA_STEP_UP_INVALID' });
        return;
      }

      if (Date.now() > decoded.expiresAt) {
        res
          .status(401)
          .json({ success: false, error: 'Step-up token expired', code: 'MFA_STEP_UP_EXPIRED' });
        return;
      }

      if (Date.now() - decoded.issuedAt > maxAgeMs) {
        res
          .status(401)
          .json({ success: false, error: 'Step-up token expired', code: 'MFA_STEP_UP_EXPIRED' });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Step-up verification failed',
        code: 'MFA_STEP_UP_INVALID',
      });
    }
  };
}
