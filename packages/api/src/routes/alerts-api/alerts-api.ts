import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AlertRepository, StudentRepository } from '@scholaracle/database';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  findAccessibleAlert,
  listVisibleAlerts,
  toAlertListItem,
  type IAlertInboxRepos,
} from '../../services/alerts/alertInbox';

export interface IAlertsApiRouterConfig {
  readonly database: Db;
}

interface IAlertsApiDeps extends IAlertInboxRepos {
  readonly alertRepository: AlertRepository;
}

function requireUserId(req: Request): string {
  const userId = (req as IAuthenticatedRequest).userId;
  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }
  return userId;
}

function requireAlertId(req: Request): string {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Missing alert ID');
  }
  return id;
}

/**
 * GET /api/alerts-api — every alert for a student the caller owns or has accepted a share of
 * (sharing-spec §4.5), trimmed to the caller's own alert types; `acknowledged` is the caller's.
 */
async function handleGetAlerts(req: Request, res: Response, deps: IAlertsApiDeps): Promise<void> {
  const userId = requireUserId(req);
  res.status(200).json(await listVisibleAlerts(userId, deps));
}

/** GET /api/alerts-api/:id — one alert the caller may see, acknowledgement as the caller's. */
async function handleGetAlert(req: Request, res: Response, deps: IAlertsApiDeps): Promise<void> {
  const userId = requireUserId(req);
  const id = requireAlertId(req);
  const alert = await findAccessibleAlert(id, userId, deps);
  res.status(200).json({ ...toAlertListItem(alert, userId), id: alert.id ?? id });
}

/**
 * POST /api/alerts-api/:id/acknowledge — acknowledgement is per person: writes
 * `acknowledgedBy[caller]`; the legacy fields follow the owner only.
 */
async function handleAcknowledgeAlert(
  req: Request,
  res: Response,
  deps: IAlertsApiDeps
): Promise<void> {
  const userId = requireUserId(req);
  const id = requireAlertId(req);
  const alert = await findAccessibleAlert(id, userId, deps);
  const acknowledged = await deps.alertRepository.acknowledgeFor(id, userId, alert.userId);
  if (!acknowledged) {
    throw new NotFoundError('Alert not found');
  }
  res.status(200).json({ success: true });
}

/** DELETE /api/alerts-api/:id — owner only; shared adults acknowledge, they do not delete. */
async function handleDeleteAlert(req: Request, res: Response, deps: IAlertsApiDeps): Promise<void> {
  const userId = requireUserId(req);
  const id = requireAlertId(req);
  const alert = await deps.alertRepository.findById(id);
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }
  if (alert.userId !== userId) {
    throw new ForbiddenError('Forbidden');
  }
  const deleted = await deps.alertRepository.delete(id);
  if (!deleted) {
    throw new NotFoundError('Alert not found');
  }
  res.status(200).json({ success: true });
}

/**
 * Create alerts API router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function alertsApiRouter(config: IAlertsApiRouterConfig): Router {
  const router = Router();
  const deps: IAlertsApiDeps = {
    alertRepository: new AlertRepository(config.database),
    studentRepository: new StudentRepository(config.database),
  };

  router.get(
    '/',
    asyncHandler((req: Request, res: Response) => handleGetAlerts(req, res, deps))
  );
  router.get(
    '/:id',
    asyncHandler((req: Request, res: Response) => handleGetAlert(req, res, deps))
  );
  router.post(
    '/:id/acknowledge',
    asyncHandler((req: Request, res: Response) => handleAcknowledgeAlert(req, res, deps))
  );
  router.delete(
    '/:id',
    asyncHandler((req: Request, res: Response) => handleDeleteAlert(req, res, deps))
  );

  return router;
}
