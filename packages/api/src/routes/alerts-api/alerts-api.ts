import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AlertRepository } from '@scholaracle/database';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAlertData } from '@scholaracle/interfaces';

export interface IAlertsApiRouterConfig {
  readonly database: Db;
}

/**
 * Handle get alerts request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param alertRepository - Alert repository
 */
async function handleGetAlerts(
  req: Request,
  res: Response,
  alertRepository: AlertRepository
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;

  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const alerts = await alertRepository.findByUserId(userId);

  // Convert to DTO format
  const alertDTOs = alerts.map((alert) => {
    const alertWithId = alert as IAlertData & { id?: string };
    return {
      id: alertWithId.id ?? '',
      studentId: alert.studentId,
      userId: alert.userId,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      acknowledged: alert.acknowledged ?? false,
      acknowledgedAt: alert.acknowledgedAt?.toISOString(),
      createdAt: alert.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  });

  res.status(200).json(alertDTOs);
}

/**
 * Handle get single alert request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param alertRepository - Alert repository
 */
async function handleGetAlert(
  req: Request,
  res: Response,
  alertRepository: AlertRepository
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;

  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Missing alert ID');
  }

  const alert = await alertRepository.findById(id);

  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  // Check authorization
  if (alert.userId !== userId) {
    throw new ForbiddenError('Forbidden');
  }

  // Convert to DTO format
  const alertWithId = alert as IAlertData & { id?: string };
  const alertDTO = {
    id: alertWithId.id ?? id,
    studentId: alert.studentId,
    userId: alert.userId,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    acknowledged: alert.acknowledged ?? false,
    acknowledgedAt: alert.acknowledgedAt?.toISOString(),
    createdAt: alert.createdAt?.toISOString() ?? new Date().toISOString(),
  };

  res.status(200).json(alertDTO);
}

/**
 * Handle acknowledge alert request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param alertRepository - Alert repository
 */
async function handleAcknowledgeAlert(
  req: Request,
  res: Response,
  alertRepository: AlertRepository
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;

  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Missing alert ID');
  }

  // Check if alert exists and belongs to user
  const alert = await alertRepository.findById(id);

  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.userId !== userId) {
    throw new ForbiddenError('Forbidden');
  }

  const acknowledged = await alertRepository.acknowledge(id);

  if (!acknowledged) {
    throw new NotFoundError('Alert not found');
  }

  res.status(200).json({
    success: true,
  });
}

/**
 * Handle delete alert request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param alertRepository - Alert repository
 */
async function handleDeleteAlert(
  req: Request,
  res: Response,
  alertRepository: AlertRepository
): Promise<void> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;

  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }

  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Missing alert ID');
  }

  // Check if alert exists and belongs to user
  const alert = await alertRepository.findById(id);

  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.userId !== userId) {
    throw new ForbiddenError('Forbidden');
  }

  const deleted = await alertRepository.delete(id);

  if (!deleted) {
    throw new NotFoundError('Alert not found');
  }

  res.status(200).json({
    success: true,
  });
}

/**
 * Create alerts API router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function alertsApiRouter(config: IAlertsApiRouterConfig): Router {
  const router = Router();
  const alertRepository = new AlertRepository(config.database);

  /**
   * GET /api/alerts-api
   * Get all alerts for authenticated user.
   */
  router.get(
    '/',
    asyncHandler((req: Request, res: Response) => handleGetAlerts(req, res, alertRepository))
  );

  /**
   * GET /api/alerts-api/:id
   * Get single alert by ID.
   */
  router.get(
    '/:id',
    asyncHandler((req: Request, res: Response) => handleGetAlert(req, res, alertRepository))
  );

  /**
   * POST /api/alerts-api/:id/acknowledge
   * Acknowledge an alert.
   */
  router.post(
    '/:id/acknowledge',
    asyncHandler((req: Request, res: Response) => handleAcknowledgeAlert(req, res, alertRepository))
  );

  /**
   * DELETE /api/alerts-api/:id
   * Delete an alert.
   */
  router.delete(
    '/:id',
    asyncHandler((req: Request, res: Response) => handleDeleteAlert(req, res, alertRepository))
  );

  return router;
}
