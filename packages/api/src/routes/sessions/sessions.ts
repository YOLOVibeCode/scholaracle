import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SessionRepository } from '@scholaracle/database';
import { AuthenticationError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import { authMiddleware } from '../../middleware/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AuthService } from '@scholaracle/auth';

export interface ISessionsRouterConfig {
  readonly database: Db;
  readonly authService: AuthService;
}

/**
 * GET /api/sessions - List current user's active sessions.
 * Returns sessions with isCurrent true for the session matching the JWT's fid.
 */
async function handleListSessions(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository,
  authService: AuthService
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;
  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const authHeader = req.headers.authorization;
  let currentFamilyId: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const decoded = await authService.verifyToken(authHeader.substring(7));
    currentFamilyId = decoded?.fid;
  }

  const sessions = await sessionRepo.findActiveByUserId(userId, 'user');
  const list = sessions.map((s) => ({
    id: s._id.toString(),
    deviceInfo: s.deviceInfo,
    ipAddress: s.ipAddress,
    location: s.location,
    lastActiveAt: s.lastActiveAt,
    createdAt: s.createdAt,
    isCurrent: s.refreshTokenFamilyId === currentFamilyId,
  }));

  res.status(200).json({ success: true, sessions: list });
}

/**
 * DELETE /api/sessions/:id - Revoke a specific session (must own it).
 */
async function handleRevokeSession(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;
  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const sessionId = (req.params as { id?: string }).id;
  if (!sessionId) {
    throw new ValidationError('Session ID required');
  }

  const sessions = await sessionRepo.findActiveByUserId(userId, 'user');
  const session = sessions.find((s) => s._id.toString() === sessionId);
  if (!session) {
    throw new NotFoundError('Session not found');
  }

  await sessionRepo.revokeById(sessionId);
  res.status(200).json({ success: true });
}

/**
 * DELETE /api/sessions - Revoke all other sessions (keep current).
 * Uses JWT fid to identify current session.
 */
async function handleRevokeAllOtherSessions(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository,
  authService: AuthService
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;
  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('Unauthorized');
  }
  const decoded = await authService.verifyToken(authHeader.substring(7));
  const currentFamilyId = decoded?.fid;
  if (!currentFamilyId) {
    throw new ValidationError('Cannot identify current session');
  }

  const revoked = await sessionRepo.revokeAllExcept(userId, 'user', currentFamilyId);
  res.status(200).json({ success: true, revoked });
}

export function sessionsRouter(config: ISessionsRouterConfig): Router {
  const router = Router();
  const sessionRepo = new SessionRepository(config.database);

  router.get(
    '/',
    authMiddleware(config.authService),
    asyncHandler((req: Request, res: Response) =>
      handleListSessions(req, res, sessionRepo, config.authService)
    )
  );

  router.delete(
    '/:id',
    authMiddleware(config.authService),
    asyncHandler((req: Request, res: Response) => handleRevokeSession(req, res, sessionRepo))
  );

  router.delete(
    '/',
    authMiddleware(config.authService),
    asyncHandler((req: Request, res: Response) =>
      handleRevokeAllOtherSessions(req, res, sessionRepo, config.authService)
    )
  );

  return router;
}
