import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { IUserPreferences } from '@scholaracle/database';

export interface ISettingsRouterConfig {
  readonly database: Db;
}

export interface INotificationSettings {
  readonly push?: boolean;
  readonly email?: boolean;
  readonly sms?: boolean;
}

export interface IAlertThresholds {
  readonly gradeDrop?: number;
  readonly daysBeforeDeadline?: number;
  readonly lowGradeThreshold?: number;
}

/**
 * Validate alert thresholds.
 *
 * @param alerts - Alert thresholds
 * @returns Error message if invalid, undefined if valid
 */
function validateAlertThresholds(alerts: IAlertThresholds): string | undefined {
  if (alerts.gradeDrop !== undefined && (alerts.gradeDrop < 0 || alerts.gradeDrop > 100)) {
    return 'gradeDrop must be between 0 and 100';
  }

  if (alerts.daysBeforeDeadline !== undefined && (alerts.daysBeforeDeadline < 0 || alerts.daysBeforeDeadline > 30)) {
    return 'daysBeforeDeadline must be between 0 and 30';
  }

  if (alerts.lowGradeThreshold !== undefined && (alerts.lowGradeThreshold < 0 || alerts.lowGradeThreshold > 100)) {
    return 'lowGradeThreshold must be between 0 and 100';
  }

  return undefined;
}

/**
 * Handle get settings request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param userRepository - User repository
 */
async function handleGetSettings(
  req: Request,
  res: Response,
  userRepository: UserRepository
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

    const user = await userRepository.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Return settings with defaults
    const settings = {
      notifications: {
        push: user.preferences.notifications.push ?? true,
        email: user.preferences.notifications.email ?? true,
        sms: user.preferences.notifications.sms ?? false,
      },
      alerts: {
        gradeDrop: user.preferences.alerts?.gradeDrop ?? 5,
        daysBeforeDeadline: user.preferences.alerts?.daysBeforeDeadline ?? 2,
        lowGradeThreshold: user.preferences.alerts?.lowGradeThreshold ?? 80,
      },
    };

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Handle update settings request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param userRepository - User repository
 */
async function handleUpdateSettings(
  req: Request,
  res: Response,
  userRepository: UserRepository
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

    const { notifications, alerts } = req.body as {
      notifications?: INotificationSettings;
      alerts?: IAlertThresholds;
    };

    // Validate alert thresholds if provided
    if (alerts) {
      const validationError = validateAlertThresholds(alerts);
      if (validationError) {
        res.status(400).json({
          success: false,
          error: validationError,
        });
        return;
      }
    }

    // Get current user
    const user = await userRepository.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Merge updates with existing preferences
    const updatedPreferences: IUserPreferences = {
      notifications: {
        ...user.preferences.notifications,
        ...(notifications && {
          push: notifications.push ?? user.preferences.notifications.push ?? true,
          email: notifications.email ?? user.preferences.notifications.email ?? true,
          sms: notifications.sms ?? user.preferences.notifications.sms ?? false,
        }),
      },
      alerts: {
        ...user.preferences.alerts,
        ...(alerts && {
          gradeDrop: alerts.gradeDrop ?? user.preferences.alerts?.gradeDrop,
          daysBeforeDeadline: alerts.daysBeforeDeadline ?? user.preferences.alerts?.daysBeforeDeadline,
          lowGradeThreshold: alerts.lowGradeThreshold ?? user.preferences.alerts?.lowGradeThreshold,
        }),
      },
    };

    await userRepository.update(userId, {
      preferences: updatedPreferences,
    });

    // Return updated settings
    const settings = {
      notifications: {
        push: updatedPreferences.notifications.push ?? true,
        email: updatedPreferences.notifications.email ?? true,
        sms: updatedPreferences.notifications.sms ?? false,
      },
      alerts: {
        gradeDrop: updatedPreferences.alerts?.gradeDrop ?? 5,
        daysBeforeDeadline: updatedPreferences.alerts?.daysBeforeDeadline ?? 2,
        lowGradeThreshold: updatedPreferences.alerts?.lowGradeThreshold ?? 80,
      },
    };

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Handle update notifications request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param userRepository - User repository
 */
async function handleUpdateNotifications(
  req: Request,
  res: Response,
  userRepository: UserRepository
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

    const notifications = req.body as INotificationSettings;

    const user = await userRepository.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    const updatedPreferences: IUserPreferences = {
      ...user.preferences,
      notifications: {
        ...user.preferences.notifications,
        push: notifications.push ?? user.preferences.notifications.push,
        email: notifications.email ?? user.preferences.notifications.email,
        sms: notifications.sms ?? user.preferences.notifications.sms,
      },
    };

    await userRepository.update(userId, {
      preferences: updatedPreferences,
    });

    const settings = {
      notifications: {
        push: updatedPreferences.notifications.push ?? true,
        email: updatedPreferences.notifications.email ?? true,
        sms: updatedPreferences.notifications.sms ?? false,
      },
      alerts: {
        gradeDrop: user.preferences.alerts?.gradeDrop ?? 5,
        daysBeforeDeadline: user.preferences.alerts?.daysBeforeDeadline ?? 2,
        lowGradeThreshold: user.preferences.alerts?.lowGradeThreshold ?? 80,
      },
    };

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Handle update alerts request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param userRepository - User repository
 */
async function handleUpdateAlerts(
  req: Request,
  res: Response,
  userRepository: UserRepository
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

    const alerts = req.body as IAlertThresholds;

    // Validate thresholds
    const validationError = validateAlertThresholds(alerts);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    const user = await userRepository.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    const updatedPreferences: IUserPreferences = {
      ...user.preferences,
      alerts: {
        ...user.preferences.alerts,
        gradeDrop: alerts.gradeDrop ?? user.preferences.alerts?.gradeDrop,
        daysBeforeDeadline: alerts.daysBeforeDeadline ?? user.preferences.alerts?.daysBeforeDeadline,
        lowGradeThreshold: alerts.lowGradeThreshold ?? user.preferences.alerts?.lowGradeThreshold,
      },
    };

    await userRepository.update(userId, {
      preferences: updatedPreferences,
    });

    const settings = {
      notifications: {
        push: user.preferences.notifications.push ?? true,
        email: user.preferences.notifications.email ?? true,
        sms: user.preferences.notifications.sms ?? false,
      },
      alerts: {
        gradeDrop: updatedPreferences.alerts?.gradeDrop ?? 5,
        daysBeforeDeadline: updatedPreferences.alerts?.daysBeforeDeadline ?? 2,
        lowGradeThreshold: updatedPreferences.alerts?.lowGradeThreshold ?? 80,
      },
    };

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Create settings router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function settingsRouter(config: ISettingsRouterConfig): Router {
  const router = Router();
  const userRepository = new UserRepository(config.database);

  /**
   * GET /api/settings
   * Get user settings.
   */
  router.get('/', (req: Request, res: Response) => {
    void handleGetSettings(req, res, userRepository);
  });

  /**
   * PUT /api/settings
   * Update all settings.
   */
  router.put('/', (req: Request, res: Response) => {
    void handleUpdateSettings(req, res, userRepository);
  });

  /**
   * PUT /api/settings/notifications
   * Update notification preferences only.
   */
  router.put('/notifications', (req: Request, res: Response) => {
    void handleUpdateNotifications(req, res, userRepository);
  });

  /**
   * PUT /api/settings/alerts
   * Update alert thresholds only.
   */
  router.put('/alerts', (req: Request, res: Response) => {
    void handleUpdateAlerts(req, res, userRepository);
  });

  return router;
}

