import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SessionRepository } from '@scholaracle/database';
import { authMiddleware } from '../../middleware/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * DELETE /api/sessions/:id - Revoke a specific session (must own it).
 */
async function handleRevokeSession(
  req: Request,
  res: Response,
  sessionRepo: SessionRepository
): Promise<void> {
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const sessionId = (req.params as { id?: string }).id;
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Session ID required' });
      return;
    }

    const sessions = await sessionRepo.findActiveByUserId(userId, 'user');
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const decoded = await authService.verifyToken(authHeader.substring(7));
    const currentFamilyId = decoded?.fid;
    if (!currentFamilyId) {
      res.status(400).json({
        success: false,
        error: 'Cannot identify current session',
      });
      return;
    }

    const revoked = await sessionRepo.revokeAllExcept(userId, 'user', currentFamilyId);
    res.status(200).json({ success: true, revoked });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function sessionsRouter(config: ISessionsRouterConfig): Router {
  const router = Router();
  const sessionRepo = new SessionRepository(config.database);

  router.get('/', authMiddleware(config.authService), (req: Request, res: Response) => {
    void handleListSessions(req, res, sessionRepo, config.authService);
  });

  router.delete('/:id', authMiddleware(config.authService), (req: Request, res: Response) => {
    void handleRevokeSession(req, res, sessionRepo);
  });

  router.delete('/', authMiddleware(config.authService), (req: Request, res: Response) => {
    void handleRevokeAllOtherSessions(req, res, sessionRepo, config.authService);
  });

  return router;
}
