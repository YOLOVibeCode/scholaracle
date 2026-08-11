import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import jwt from 'jsonwebtoken';
import { SessionRepository } from '@scholaracle/database';
import { AuthenticationError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import type { IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
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
  const authReq = req as IAdminAuthenticatedRequest;
  const adminId = authReq.adminId;
  if (!adminId) {
    throw new AuthenticationError('Unauthorized');
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
}

/**
 * DELETE /api/admin/sessions/:id - Revoke a specific admin session (must own it).
 */
async function handleRevokeAdminSession(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository
): Promise<void> {
  const authReq = req as IAdminAuthenticatedRequest;
  const adminId = authReq.adminId;
  if (!adminId) {
    throw new AuthenticationError('Unauthorized');
  }

  const sessionId = (req.params as { id?: string }).id;
  if (!sessionId) {
    throw new ValidationError('Session ID required');
  }

  const sessions = await sessionRepo.findActiveByAdminId(adminId);
  const session = sessions.find((s) => s._id.toString() === sessionId);
  if (!session) {
    throw new NotFoundError('Session not found');
  }

  await sessionRepo.revokeById(sessionId);
  res.status(200).json({ success: true });
}

export function adminSessionsRouter(config: IAdminSessionsRouterConfig): Router {
  const router = Router();
  const sessionRepo = new SessionRepository(config.database);

  router.get(
    '/',
    adminAuthMiddleware(config.adminAuthService),
    asyncHandler((req: Request, res: Response) =>
      handleListAdminSessions(req, res, sessionRepo, config.adminJwtSecret)
    )
  );

  router.delete(
    '/:id',
    adminAuthMiddleware(config.adminAuthService),
    asyncHandler((req: Request, res: Response) => handleRevokeAdminSession(req, res, sessionRepo))
  );

  return router;
}
