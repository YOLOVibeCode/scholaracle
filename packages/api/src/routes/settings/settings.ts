import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import type { IAuthService } from '@scholaracle/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { IUserPreferences } from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';

export interface ISettingsRouterConfig {
  readonly database: Db;
  readonly authService?: IAuthService;
}

export interface INotificationSettings {
  readonly push?: boolean;
  readonly email?: boolean;
  readonly sms?: boolean;
  readonly inApp?: boolean;
  readonly quietHours?: {
    readonly enabled: boolean;
    readonly start: string;
    readonly end: string;
    readonly criticalOverride: boolean;
  };
  readonly digestSchedule?: {
    readonly daily?: { readonly enabled: boolean; readonly time: string };
    readonly weekly?: { readonly enabled: boolean; readonly day: string; readonly time: string };
  };
  readonly tone?: 'formal' | 'casual' | 'encouraging';
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
}

export interface IAlertThresholds {
  readonly gradeDrop?: number;
  readonly daysBeforeDeadline?: number;
  readonly lowGradeThreshold?: number;
  readonly prioritizeHighImpact?: boolean;
  readonly emphasizeWeakSubjects?: boolean;
  readonly celebrateWins?: boolean;
  readonly enabledTypes?: Record<string, { readonly enabled: boolean; readonly severity: string }>;
}

const HHMM_REGEX = /^\d{2}:\d{2}$/;
const VALID_TONES = ['formal', 'casual', 'encouraging'] as const;
const VALID_FREQUENCIES = ['minimal', 'balanced', 'proactive'] as const;

function validateAlertThresholds(alerts: IAlertThresholds): string | undefined {
  if (alerts.gradeDrop !== undefined && (alerts.gradeDrop < 0 || alerts.gradeDrop > 100)) {
    return 'gradeDrop must be between 0 and 100';
  }

  if (
    alerts.daysBeforeDeadline !== undefined &&
    (alerts.daysBeforeDeadline < 0 || alerts.daysBeforeDeadline > 30)
  ) {
    return 'daysBeforeDeadline must be between 0 and 30';
  }

  if (
    alerts.lowGradeThreshold !== undefined &&
    (alerts.lowGradeThreshold < 0 || alerts.lowGradeThreshold > 100)
  ) {
    return 'lowGradeThreshold must be between 0 and 100';
  }

  return undefined;
}

function validateQuietHours(q: INotificationSettings['quietHours']): string | undefined {
  if (!q) return undefined;
  if (!HHMM_REGEX.test(q.start)) return 'quietHours.start must be HH:mm';
  if (!HHMM_REGEX.test(q.end)) return 'quietHours.end must be HH:mm';
  return undefined;
}

function validateDigestSchedule(d: INotificationSettings['digestSchedule']): string | undefined {
  if (!d) return undefined;
  if (d.daily?.time !== undefined && !HHMM_REGEX.test(d.daily.time))
    return 'digestSchedule.daily.time must be HH:mm';
  if (d.weekly?.time !== undefined && !HHMM_REGEX.test(d.weekly.time))
    return 'digestSchedule.weekly.time must be HH:mm';
  return undefined;
}

function defaultEnabledTypes(): Record<string, { enabled: boolean; severity: string }> {
  const types = Object.values(AlertType);
  const map: Record<string, { enabled: boolean; severity: string }> = {};
  const defaultSeverity: Record<string, string> = {
    [AlertType.MISSING_ASSIGNMENT]: 'warning',
    [AlertType.DEADLINE]: 'info',
    [AlertType.GRADE_DROP]: 'critical',
    [AlertType.TEST]: 'info',
    [AlertType.WORKLOAD]: 'warning',
    [AlertType.POSITIVE]: 'info',
    [AlertType.RECOMMENDATION]: 'info',
  };
  for (const t of types) {
    map[t] = { enabled: true, severity: defaultSeverity[t] ?? 'info' };
  }
  return map;
}

const VALID_GRADE_DISPLAY = ['letter', 'score'] as const;

function buildSettingsResponse(prefs: IUserPreferences): Record<string, unknown> {
  const notif = prefs.notifications;
  const alerts = prefs.alerts ?? {};
  const dashboard = prefs.dashboard ?? {};
  const defaults = defaultEnabledTypes();
  const enabledTypes = { ...defaults, ...alerts.enabledTypes };
  return {
    dashboard: {
      gradeDisplay: dashboard.gradeDisplay ?? 'letter',
    },
    notifications: {
      push: notif.push ?? true,
      email: notif.email ?? true,
      sms: notif.sms ?? false,
      inApp: true,
      quietHours: {
        enabled: notif.quietHours?.enabled ?? true,
        start: notif.quietHours?.start ?? '22:00',
        end: notif.quietHours?.end ?? '07:00',
        criticalOverride: notif.quietHours?.criticalOverride ?? true,
      },
      digestSchedule: {
        daily: notif.digestSchedule?.daily ?? { enabled: true, time: '07:00' },
        weekly: notif.digestSchedule?.weekly ?? { enabled: true, day: 'sunday', time: '18:00' },
      },
      tone: notif.tone ?? 'encouraging',
      frequency: notif.frequency ?? 'balanced',
    },
    alerts: {
      gradeDrop: alerts.gradeDrop ?? 5,
      daysBeforeDeadline: alerts.daysBeforeDeadline ?? 2,
      lowGradeThreshold: alerts.lowGradeThreshold ?? 80,
      prioritizeHighImpact: alerts.prioritizeHighImpact ?? true,
      emphasizeWeakSubjects: alerts.emphasizeWeakSubjects ?? true,
      celebrateWins: alerts.celebrateWins ?? true,
      enabledTypes,
    },
  };
}

const VALID_OAUTH_PROVIDERS = ['google', 'apple', 'microsoft'] as const;

/**
 * Handle unlink OAuth provider request.
 */
async function handleUnlinkOAuth(
  req: Request,
  res: Response,
  authService: IAuthService
): Promise<void> {
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const provider = req.params['provider'] as string;
    if (
      !provider ||
      !VALID_OAUTH_PROVIDERS.includes(provider as (typeof VALID_OAUTH_PROVIDERS)[number])
    ) {
      res.status(400).json({ success: false, error: 'Invalid provider' });
      return;
    }
    const result = await authService.unlinkOAuthAccount(
      userId,
      provider as 'google' | 'apple' | 'microsoft'
    );
    if (result.success) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
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

    const settingsBody = buildSettingsResponse(user.preferences);
    res.status(200).json({
      ...settingsBody,
      profile: {
        name: user.name,
        email: user.email,
        oauthProviders: user.oauthProviders ?? [],
      },
    });
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

    const {
      notifications,
      alerts,
      dashboard: dashboardBody,
    } = req.body as {
      notifications?: INotificationSettings;
      alerts?: IAlertThresholds;
      dashboard?: { gradeDisplay?: 'letter' | 'score' };
    };

    if (alerts) {
      const validationError = validateAlertThresholds(alerts);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }
    }
    if (notifications?.quietHours) {
      const err = validateQuietHours(notifications.quietHours);
      if (err) {
        res.status(400).json({ success: false, error: err });
        return;
      }
    }
    if (notifications?.digestSchedule) {
      const err = validateDigestSchedule(notifications.digestSchedule);
      if (err) {
        res.status(400).json({ success: false, error: err });
        return;
      }
    }
    if (notifications?.tone !== undefined && !VALID_TONES.includes(notifications.tone)) {
      res
        .status(400)
        .json({ success: false, error: 'tone must be formal, casual, or encouraging' });
      return;
    }
    if (
      notifications?.frequency !== undefined &&
      !VALID_FREQUENCIES.includes(notifications.frequency)
    ) {
      res
        .status(400)
        .json({ success: false, error: 'frequency must be minimal, balanced, or proactive' });
      return;
    }
    if (
      dashboardBody?.gradeDisplay !== undefined &&
      !VALID_GRADE_DISPLAY.includes(dashboardBody.gradeDisplay)
    ) {
      res
        .status(400)
        .json({ success: false, error: 'dashboard.gradeDisplay must be letter or score' });
      return;
    }

    const user = await userRepository.findById(userId);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const notif = user.preferences.notifications;
    const existingDashboard = user.preferences.dashboard ?? { gradeDisplay: 'letter' as const };
    const updatedPreferences: IUserPreferences = {
      notifications: {
        push: notifications?.push ?? notif.push ?? true,
        email: notifications?.email ?? notif.email ?? true,
        sms: notifications?.sms ?? notif.sms ?? false,
        quietHours: notifications?.quietHours ??
          notif.quietHours ?? {
            enabled: true,
            start: '22:00',
            end: '07:00',
            criticalOverride: true,
          },
        digestSchedule: notifications?.digestSchedule ??
          notif.digestSchedule ?? {
            daily: { enabled: true, time: '07:00' },
            weekly: { enabled: true, day: 'sunday', time: '18:00' },
          },
        tone: notifications?.tone ?? notif.tone ?? 'encouraging',
        frequency: notifications?.frequency ?? notif.frequency ?? 'balanced',
      },
      alerts: {
        gradeDrop: alerts?.gradeDrop ?? user.preferences.alerts?.gradeDrop ?? 5,
        daysBeforeDeadline:
          alerts?.daysBeforeDeadline ?? user.preferences.alerts?.daysBeforeDeadline ?? 2,
        lowGradeThreshold:
          alerts?.lowGradeThreshold ?? user.preferences.alerts?.lowGradeThreshold ?? 80,
        prioritizeHighImpact:
          alerts?.prioritizeHighImpact ?? user.preferences.alerts?.prioritizeHighImpact ?? true,
        emphasizeWeakSubjects:
          alerts?.emphasizeWeakSubjects ?? user.preferences.alerts?.emphasizeWeakSubjects ?? true,
        celebrateWins: alerts?.celebrateWins ?? user.preferences.alerts?.celebrateWins ?? true,
        enabledTypes:
          alerts?.enabledTypes ?? user.preferences.alerts?.enabledTypes ?? defaultEnabledTypes(),
      },
      dashboard: {
        gradeDisplay: dashboardBody?.gradeDisplay ?? existingDashboard.gradeDisplay ?? 'letter',
      },
    };

    await userRepository.update(userId, { preferences: updatedPreferences });

    res.status(200).json(buildSettingsResponse(updatedPreferences));
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

    const notif = user.preferences.notifications;
    const updatedPreferences: IUserPreferences = {
      ...user.preferences,
      notifications: {
        ...notif,
        push: notifications.push ?? notif.push,
        email: notifications.email ?? notif.email,
        sms: notifications.sms ?? notif.sms,
      },
    };

    await userRepository.update(userId, { preferences: updatedPreferences });

    res.status(200).json(buildSettingsResponse(updatedPreferences));
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
        daysBeforeDeadline:
          alerts.daysBeforeDeadline ?? user.preferences.alerts?.daysBeforeDeadline,
        lowGradeThreshold: alerts.lowGradeThreshold ?? user.preferences.alerts?.lowGradeThreshold,
      },
    };

    await userRepository.update(userId, { preferences: updatedPreferences });

    res.status(200).json(buildSettingsResponse(updatedPreferences));
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

  /**
   * DELETE /api/settings/oauth/:provider
   * Unlink an OAuth provider from the current user.
   */
  if (config.authService) {
    router.delete('/oauth/:provider', (req: Request, res: Response) => {
      void handleUnlinkOAuth(req, res, config.authService!);
    });
  }

  return router;
}
