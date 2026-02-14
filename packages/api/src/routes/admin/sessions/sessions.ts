import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import jwt from 'jsonwebtoken';
import { SessionRepository } from '@scholaracle/database';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
import { AdminAuthService } from '@scholaracle/auth';

export interface IAdminSessionsRouterConfig {
  readonly database: Db;
  readonly adminAuthService: AdminAuthService;
  readonly adminJwtSecret: string;
}

/**
 * GET /api/admin/sessions - List current admin's active sessions.
 */
async function handleListAdminSessions(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository,
  _adminJwtSecret: string
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    const adminId = authReq.adminId;
    if (!adminId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const authHeader = req.headers.authorization;
    let currentJti: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = jwt.decode(authHeader.substring(7)) as { jti?: string } | null;
      currentJti = decoded?.jti;
    }

    const sessions = await sessionRepo.findActiveByAdminId(adminId);
    const list = sessions.map((s) => ({
      id: s._id.toString(),
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s.refreshTokenFamilyId === currentJti,
    }));

    res.status(200).json({ success: true, sessions: list });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * DELETE /api/admin/sessions/:id - Revoke a specific admin session (must own it).
 */
async function handleRevokeAdminSession(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository
): Promise<void> {
  try {
    const authReq = req as IAdminAuthenticatedRequest;
    const adminId = authReq.adminId;
    if (!adminId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const sessionId = (req.params as { id?: string }).id;
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID required' });
      return;
    }

    const sessions = await sessionRepo.findActiveByAdminId(adminId);
    const session = sessions.find((s) => s._id.toString() === sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    await sessionRepo.revokeById(sessionId);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function adminSessionsRouter(config: IAdminSessionsRouterConfig): Router {
  const router = Router();
  const sessionRepo = new SessionRepository(config.database);

  router.get(
    '/',
    adminAuthMiddleware(config.adminAuthService),
    (req: Request, res: Response) => {
      void handleListAdminSessions(req, res, sessionRepo, config.adminJwtSecret);
    }
  );

  router.delete(
    '/:id',
    adminAuthMiddleware(config.adminAuthService),
    (req: Request, res: Response) => {
      void handleRevokeAdminSession(req, res, sessionRepo);
    }
  );

  return router;
}
