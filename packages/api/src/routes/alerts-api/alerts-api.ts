import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AlertRepository } from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Missing alert ID',
      });
      return;
    }

    const alert = await alertRepository.findById(id);

    if (!alert) {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
      return;
    }

    // Check authorization
    if (alert.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Missing alert ID',
      });
      return;
    }

    // Check if alert exists and belongs to user
    const alert = await alertRepository.findById(id);

    if (!alert) {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
      return;
    }

    if (alert.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
      });
      return;
    }

    const acknowledged = await alertRepository.acknowledge(id);

    if (!acknowledged) {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Missing alert ID',
      });
      return;
    }

    // Check if alert exists and belongs to user
    const alert = await alertRepository.findById(id);

    if (!alert) {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
      return;
    }

    if (alert.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
      });
      return;
    }

    const deleted = await alertRepository.delete(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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
  router.get('/', (req: Request, res: Response) => {
    void handleGetAlerts(req, res, alertRepository);
  });

  /**
   * GET /api/alerts-api/:id
   * Get single alert by ID.
   */
  router.get('/:id', (req: Request, res: Response) => {
    void handleGetAlert(req, res, alertRepository);
  });

  /**
   * POST /api/alerts-api/:id/acknowledge
   * Acknowledge an alert.
   */
  router.post('/:id/acknowledge', (req: Request, res: Response) => {
    void handleAcknowledgeAlert(req, res, alertRepository);
  });

  /**
   * DELETE /api/alerts-api/:id
   * Delete an alert.
   */
  router.delete('/:id', (req: Request, res: Response) => {
    void handleDeleteAlert(req, res, alertRepository);
  });

  return router;
}

