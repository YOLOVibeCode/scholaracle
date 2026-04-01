import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { ISessionRepository } from '@scholaracle/database';
import type { IAdminAuthenticatedRequest } from './adminAuth';

const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * Admin session timeout middleware.
 * Checks if the admin session has been inactive for longer than the configured timeout.
 * If the session is still active, updates `lastActiveAt` (fire-and-forget).
 *
 * Must be mounted AFTER adminAuthMiddleware (requires req.adminId).
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function sessionTimeoutMiddleware(
  sessionRepository: ISessionRepository,
  timeoutMinutes?: number
) {
  const timeout = (timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

  return async (
    req: IAdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const adminId = req.adminId;
      if (!adminId) {
        next();
        return;
      }

      // Extract jti (refresh token family ID) from the JWT to find the session
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        next();
        return;
      }
      const token = authHeader.substring(7);
      const decoded = jwt.decode(token) as { jti?: string } | null;
      const familyId = decoded?.jti;
      if (!familyId) {
        next();
        return;
      }

      const session = await sessionRepository.findByFamilyId(adminId, 'admin', familyId);
      if (!session) {
        // No session record — let other middleware handle auth
        next();
        return;
      }

      if (session.revokedAt) {
        res.status(401).json({
          success: false,
          error: 'Session has been revoked',
        });
        return;
      }

      const elapsed = Date.now() - session.lastActiveAt.getTime();
      if (elapsed > timeout) {
        // Revoke the expired session
        await sessionRepository.revokeById(session._id.toString());
        res.status(401).json({
          success: false,
          error: 'Session expired due to inactivity',
          code: 'SESSION_TIMEOUT',
        });
        return;
      }

      // Update last active timestamp (fire-and-forget, don't block the request)
      void sessionRepository.updateLastActive(session._id.toString());

      next();
    } catch {
      // Don't block requests on session tracking failures
      next();
    }
  };
}
