import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { UserRepository, CommunicationLogRepository } from '@scholaracle/database';
import type { IAuthService } from '@scholaracle/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { IUserPreferences } from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';
import { LlmClient } from '@scholaracle/agents';

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
    readonly digestTimes?: readonly string[];
    readonly weekdaySlots?: readonly {
      readonly time: string;
      readonly label: string;
      readonly enabled: boolean;
    }[];
    readonly weekendSlots?: readonly {
      readonly time: string;
      readonly label: string;
      readonly enabled: boolean;
    }[];
    readonly schoolDays?: readonly string[];
    readonly holidayMode?: 'normal' | 'pause' | 'reduced';
    readonly autoSend?: boolean;
    readonly recipients?: 'everybody' | 'nobody' | 'specific';
    readonly specificRecipients?: readonly string[];
    readonly snoozeUntil?: string | null;
  };
  readonly tone?: 'formal' | 'casual' | 'encouraging';
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
  readonly glanceSchedule?: {
    readonly enabled: boolean;
    readonly time: string;
  };
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

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const VALID_HOLIDAY_MODES = ['normal', 'pause', 'reduced'] as const;

function validateDigestSlot(slot: {
  time?: string;
  label?: string;
  enabled?: boolean;
}): string | undefined {
  if (slot.time !== undefined && !HHMM_REGEX.test(slot.time)) return 'Slot time must be HH:mm';
  if (slot.label !== undefined && typeof slot.label !== 'string')
    return 'Slot label must be a string';
  if (slot.enabled !== undefined && typeof slot.enabled !== 'boolean')
    return 'Slot enabled must be boolean';
  return undefined;
}

function validateDigestSchedule(d: INotificationSettings['digestSchedule']): string | undefined {
  if (!d) return undefined;
  if (d.daily?.time !== undefined && !HHMM_REGEX.test(d.daily.time))
    return 'digestSchedule.daily.time must be HH:mm';
  if (d.weekly?.time !== undefined && !HHMM_REGEX.test(d.weekly.time))
    return 'digestSchedule.weekly.time must be HH:mm';
  if (d.digestTimes !== undefined) {
    if (!Array.isArray(d.digestTimes)) return 'digestSchedule.digestTimes must be an array';
    if (d.digestTimes.length > 10) return 'digestSchedule.digestTimes max 10 entries';
    for (const t of d.digestTimes) {
      if (typeof t !== 'string' || !HHMM_REGEX.test(t))
        return 'Each digestTimes entry must be HH:mm';
    }
  }
  if (d.weekdaySlots !== undefined) {
    if (!Array.isArray(d.weekdaySlots)) return 'digestSchedule.weekdaySlots must be an array';
    if (d.weekdaySlots.length > 10) return 'digestSchedule.weekdaySlots max 10 entries';
    for (let i = 0; i < d.weekdaySlots.length; i++) {
      const err = validateDigestSlot(
        d.weekdaySlots[i] as { time?: string; label?: string; enabled?: boolean }
      );
      if (err) return `digestSchedule.weekdaySlots[${i}]: ${err}`;
    }
  }
  if (d.weekendSlots !== undefined) {
    if (!Array.isArray(d.weekendSlots)) return 'digestSchedule.weekendSlots must be an array';
    if (d.weekendSlots.length > 10) return 'digestSchedule.weekendSlots max 10 entries';
    for (let i = 0; i < d.weekendSlots.length; i++) {
      const err = validateDigestSlot(
        d.weekendSlots[i] as { time?: string; label?: string; enabled?: boolean }
      );
      if (err) return `digestSchedule.weekendSlots[${i}]: ${err}`;
    }
  }
  if (d.schoolDays !== undefined) {
    if (!Array.isArray(d.schoolDays)) return 'digestSchedule.schoolDays must be an array';
    for (const day of d.schoolDays) {
      if (typeof day !== 'string' || !VALID_DAYS.includes(day as (typeof VALID_DAYS)[number]))
        return 'digestSchedule.schoolDays must be mon,tue,wed,thu,fri,sat,sun';
    }
  }
  if (d.holidayMode !== undefined && !VALID_HOLIDAY_MODES.includes(d.holidayMode))
    return 'digestSchedule.holidayMode must be normal, pause, or reduced';
  if (d.autoSend !== undefined && typeof d.autoSend !== 'boolean')
    return 'digestSchedule.autoSend must be boolean';
  const VALID_RECIPIENTS_MODES = ['everybody', 'nobody', 'specific'] as const;
  if (
    d.recipients !== undefined &&
    !VALID_RECIPIENTS_MODES.includes(d.recipients as (typeof VALID_RECIPIENTS_MODES)[number])
  )
    return 'digestSchedule.recipients must be everybody, nobody, or specific';
  if (d.specificRecipients !== undefined) {
    if (!Array.isArray(d.specificRecipients))
      return 'digestSchedule.specificRecipients must be an array';
    if (d.specificRecipients.length > 50) return 'digestSchedule.specificRecipients max 50 entries';
    for (const email of d.specificRecipients) {
      if (typeof email !== 'string' || !email.includes('@'))
        return 'Each specificRecipients entry must be a valid email';
    }
  }
  if (d.snoozeUntil !== undefined && d.snoozeUntil !== null) {
    if (typeof d.snoozeUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.snoozeUntil))
      return 'digestSchedule.snoozeUntil must be YYYY-MM-DD or null';
  }
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

const DEFAULT_WEEKDAY_SLOTS = [
  { time: '09:00', label: 'Morning', enabled: true },
  { time: '15:00', label: 'Afternoon', enabled: true },
  { time: '20:00', label: 'Evening', enabled: true },
];
const DEFAULT_SCHOOL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

function buildDigestScheduleResponse(
  d: IUserPreferences['notifications']['digestSchedule']
): Record<string, unknown> {
  const daily = d?.daily ?? { enabled: true, time: '07:00' };
  const weekly = d?.weekly ?? { enabled: true, day: 'sunday', time: '18:00' };
  const digestTimes = d?.digestTimes ?? [];
  let weekdaySlots = d?.weekdaySlots;
  const weekendSlots = d?.weekendSlots;
  if (!weekdaySlots?.length && digestTimes.length > 0) {
    weekdaySlots = digestTimes.map((time) => ({ time, label: 'Digest', enabled: true }));
  }
  if (!weekdaySlots?.length) weekdaySlots = DEFAULT_WEEKDAY_SLOTS;
  return {
    daily,
    weekly,
    digestTimes,
    weekdaySlots,
    weekendSlots: weekendSlots ?? [],
    schoolDays: d?.schoolDays ?? DEFAULT_SCHOOL_DAYS,
    holidayMode: d?.holidayMode ?? 'normal',
    autoSend: d?.autoSend ?? true,
    recipients: d?.recipients ?? 'everybody',
    specificRecipients: d?.specificRecipients ?? [],
    snoozeUntil: d?.snoozeUntil ?? null,
  };
}

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
      digestSchedule: buildDigestScheduleResponse(notif.digestSchedule),
      tone: notif.tone ?? 'encouraging',
      frequency: notif.frequency ?? 'balanced',
      glanceSchedule: {
        enabled: notif.glanceSchedule?.enabled ?? true,
        time: notif.glanceSchedule?.time ?? '07:00',
      },
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
      timezone: (user as { timezone?: string }).timezone ?? 'America/New_York',
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
      timezone,
    } = req.body as {
      notifications?: INotificationSettings;
      alerts?: IAlertThresholds;
      dashboard?: { gradeDisplay?: 'letter' | 'score' };
      timezone?: string;
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
    if (timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        res.status(400).json({ success: false, error: 'Invalid IANA timezone' });
        return;
      }
    }
    if (notifications?.glanceSchedule) {
      const gs = notifications.glanceSchedule;
      if (gs.time && !HHMM_REGEX.test(gs.time)) {
        res.status(400).json({ success: false, error: 'glanceSchedule.time must be HH:mm' });
        return;
      }
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
        digestSchedule: {
          daily: notifications?.digestSchedule?.daily ??
            notif.digestSchedule?.daily ?? { enabled: true, time: '07:00' },
          weekly: notifications?.digestSchedule?.weekly ??
            notif.digestSchedule?.weekly ?? { enabled: true, day: 'sunday', time: '18:00' },
          digestTimes:
            notifications?.digestSchedule?.digestTimes ?? notif.digestSchedule?.digestTimes ?? [],
          weekdaySlots:
            notifications?.digestSchedule?.weekdaySlots ??
            notif.digestSchedule?.weekdaySlots ??
            DEFAULT_WEEKDAY_SLOTS,
          weekendSlots:
            notifications?.digestSchedule?.weekendSlots ?? notif.digestSchedule?.weekendSlots ?? [],
          schoolDays:
            notifications?.digestSchedule?.schoolDays ??
            notif.digestSchedule?.schoolDays ??
            DEFAULT_SCHOOL_DAYS,
          holidayMode:
            notifications?.digestSchedule?.holidayMode ??
            notif.digestSchedule?.holidayMode ??
            'normal',
          autoSend:
            notifications?.digestSchedule?.autoSend ?? notif.digestSchedule?.autoSend ?? true,
          recipients:
            notifications?.digestSchedule?.recipients ??
            notif.digestSchedule?.recipients ??
            'everybody',
          specificRecipients:
            notifications?.digestSchedule?.specificRecipients ??
            notif.digestSchedule?.specificRecipients ??
            [],
          snoozeUntil:
            notifications?.digestSchedule?.snoozeUntil !== undefined
              ? (notifications.digestSchedule.snoozeUntil ?? undefined)
              : notif.digestSchedule?.snoozeUntil,
        },
        tone: notifications?.tone ?? notif.tone ?? 'encouraging',
        frequency: notifications?.frequency ?? notif.frequency ?? 'balanced',
        glanceSchedule: {
          enabled: notifications?.glanceSchedule?.enabled ?? notif.glanceSchedule?.enabled ?? true,
          time: notifications?.glanceSchedule?.time ?? notif.glanceSchedule?.time ?? '07:00',
        },
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

    const userUpdate: { preferences: IUserPreferences; timezone?: string } = {
      preferences: updatedPreferences,
    };
    if (timezone !== undefined) userUpdate.timezone = timezone;
    await userRepository.update(userId, userUpdate);

    const responseBody = buildSettingsResponse(updatedPreferences);
    res.status(200).json({
      ...responseBody,
      timezone: timezone ?? (user as { timezone?: string }).timezone ?? 'America/New_York',
    });
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
 * Handle get notification history for the authenticated user.
 * Returns the most recent communication_logs entries (capped at 50).
 */
async function handleGetNotificationHistory(
  req: Request,
  res: Response,
  commLogRepo: CommunicationLogRepository
): Promise<void> {
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const logs = await commLogRepo.findByUserId(userId);
    const limited = logs.slice(0, 50);
    res.status(200).json({
      success: true,
      data: limited.map((log) => ({
        id: log._id?.toString(),
        channel: log.channel,
        type: log.type,
        subject: log.subject,
        status: log.status,
        recipientEmail: log.recipientEmail,
        recipientPhone: log.recipientPhone,
        sentAt: log.sentAt,
        failedAt: log.failedAt,
        failureReason: log.failureReason,
        templateName: log.templateName,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export interface IHolidaySuggestionResponse {
  readonly inHoliday: boolean;
  readonly nextBreak?: { readonly start: string; readonly end: string; readonly name: string };
  readonly suggestion: string;
}

/**
 * Compute whether today is in a holiday (gap between terms) and the next break for the user.
 * Terms are from slc_academic_terms (userId-scoped).
 */
async function getHolidayState(
  database: Db,
  userId: string
): Promise<{
  inHoliday: boolean;
  nextBreak?: { start: string; end: string; name: string };
  termSummary: string;
}> {
  const terms = await database
    .collection('slc_academic_terms')
    .find({ userId, deletedAt: null })
    .toArray();

  const ranges: { start: string; end: string; title: string }[] = [];
  for (const t of terms) {
    const record = t['record'] as Record<string, unknown> | undefined;
    const start = record?.['startDate'] as string | undefined;
    const end = record?.['endDate'] as string | undefined;
    const title = (record?.['title'] as string) ?? 'Term';
    if (start && end) ranges.push({ start, end, title });
  }

  const todayYmd = new Date().toISOString().slice(0, 10);
  let inHoliday = false;
  let nextBreak: { start: string; end: string; name: string } | undefined;

  if (ranges.length === 0) {
    return { inHoliday: false, termSummary: 'No academic terms on file.' };
  }

  ranges.sort((a, b) => a.start.localeCompare(b.start));
  const firstStart = ranges[0]!.start;
  const lastEnd = ranges[ranges.length - 1]!.end;

  if (todayYmd < firstStart) {
    inHoliday = true;
    nextBreak = { start: todayYmd, end: firstStart, name: 'Before first term' };
  } else if (todayYmd > lastEnd) {
    inHoliday = true;
    nextBreak = { start: lastEnd, end: todayYmd, name: 'After last term' };
  } else {
    for (let i = 0; i < ranges.length - 1; i++) {
      const gapStart = ranges[i]!.end;
      const gapEnd = ranges[i + 1]!.start;
      if (todayYmd > gapStart && todayYmd < gapEnd) {
        inHoliday = true;
        nextBreak = { start: gapStart, end: gapEnd, name: 'Break between terms' };
        break;
      }
      if (!nextBreak && gapEnd > todayYmd) {
        nextBreak = { start: gapStart, end: gapEnd, name: 'Upcoming break' };
      }
    }
    if (!nextBreak && lastEnd > todayYmd) {
      nextBreak = { start: lastEnd, end: lastEnd, name: 'After current terms' };
    }
  }

  const termSummary = ranges.map((r) => `${r.title}: ${r.start} to ${r.end}`).join('; ');
  return { inHoliday, nextBreak, termSummary };
}

/**
 * Handle POST suggest-holidays: return AI suggestion for digest pause during holidays.
 */
async function handleSuggestHolidays(req: Request, res: Response, database: Db): Promise<void> {
  try {
    const authReq = req as IAuthenticatedRequest;
    const userId = authReq.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { inHoliday, nextBreak, termSummary } = await getHolidayState(database, userId);

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    let suggestion: string;
    if (apiKey && termSummary !== 'No academic terms on file.') {
      try {
        const llm = new LlmClient({ apiKey });
        const prompt = inHoliday
          ? `The user's academic terms: ${termSummary}. Today is during a break (${nextBreak?.name ?? 'holiday'}). Suggest in 1-2 sentences whether they should pause digest emails during this break.`
          : nextBreak
            ? `The user's academic terms: ${termSummary}. The next break is ${nextBreak.start} to ${nextBreak.end}. Suggest in 1-2 sentences whether to enable "Pause digests during school holidays" before that date.`
            : `The user's academic terms: ${termSummary}. No upcoming break. Suggest keeping normal digest settings.`;
        const response = await llm.complete([{ role: 'user' as const, content: prompt }], {
          maxTokens: 120,
          system:
            'You are a helpful assistant for a parent/student app. Reply in plain text only, 1-2 sentences.',
        });
        suggestion =
          response.content.trim() ||
          (inHoliday ? 'Consider pausing digests during this break.' : 'No change needed.');
      } catch {
        suggestion = inHoliday
          ? 'You appear to be in a school break. Consider pausing digests in Holiday settings.'
          : 'No upcoming break detected. Keep normal digest settings.';
      }
    } else {
      suggestion = inHoliday
        ? 'You appear to be in a school break. Consider pausing digests in Holiday settings.'
        : 'Add your school calendar for holiday-aware suggestions.';
    }

    const body: IHolidaySuggestionResponse = {
      inHoliday,
      ...(nextBreak && { nextBreak }),
      suggestion,
    };
    res.status(200).json(body);
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
  const commLogRepo = new CommunicationLogRepository(config.database);

  /**
   * GET /api/settings
   * Get user settings.
   */
  router.get('/', (req: Request, res: Response) => {
    void handleGetSettings(req, res, userRepository);
  });

  /**
   * GET /api/settings/notification-history
   * Get notification/communication history for the authenticated user.
   */
  router.get('/notification-history', (req: Request, res: Response) => {
    void handleGetNotificationHistory(req, res, commLogRepo);
  });

  /**
   * POST /api/settings/suggest-holidays
   * Get AI suggestion for pausing digests during school holidays (uses academic terms).
   */
  router.post('/suggest-holidays', (req: Request, res: Response) => {
    void handleSuggestHolidays(req, res, config.database);
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
