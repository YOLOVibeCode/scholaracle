/**
 * Pure model for the notification settings screen: server response -> editable
 * draft -> PUT /api/settings body. No React, no network.
 */

import {
  AlertType,
  alertTypeLabel,
  type ISettingsAlertTypePref,
  type ISettingsQuietHours,
  type IUserSettingsResponse,
  type IUserSettingsUpdateRequest,
} from '@scholaracle/contracts';

/** Alert types the API exposes, in the contracts' declaration order (one source of truth). */
export const ALERT_TYPE_KEYS: readonly string[] = Object.values(AlertType);

/** Human copy from contracts; unknown keys fall back to spaced words. */
export function alertTypeToggleLabel(key: string): string {
  return alertTypeLabel(key);
}

const DEFAULT_QUIET_HOURS: ISettingsQuietHours = {
  enabled: true,
  start: '22:00',
  end: '07:00',
  criticalOverride: true,
};

export interface IDigestDraft {
  readonly enabled: boolean;
  readonly time: string;
}

export interface IWeeklyDigestDraft extends IDigestDraft {
  readonly day: string;
}

export interface INotificationDraft {
  readonly push: boolean;
  readonly quietHours: ISettingsQuietHours;
  readonly dailyDigest: IDigestDraft;
  readonly weeklyDigest: IWeeklyDigestDraft;
  readonly types: Readonly<Record<string, ISettingsAlertTypePref>>;
  readonly timezone: string;
}

/** Builds the editable draft from the server response (defaults mirror the API's). */
export function draftFromSettings(
  settings: IUserSettingsResponse,
  deviceTimezone: string
): INotificationDraft {
  const n = settings.notifications;
  const types: Record<string, ISettingsAlertTypePref> = {};
  for (const key of ALERT_TYPE_KEYS) {
    types[key] = settings.alerts.enabledTypes?.[key] ?? { enabled: true, severity: 'info' };
  }
  // Keep any extra types the server knows about so a save never drops them.
  for (const [key, value] of Object.entries(settings.alerts.enabledTypes ?? {})) {
    if (!(key in types)) types[key] = value;
  }
  return {
    push: n.push,
    quietHours: n.quietHours ?? DEFAULT_QUIET_HOURS,
    dailyDigest: {
      enabled: n.digestSchedule?.daily?.enabled ?? true,
      time: n.digestSchedule?.daily?.time ?? '07:00',
    },
    weeklyDigest: {
      enabled: n.digestSchedule?.weekly?.enabled ?? true,
      day: n.digestSchedule?.weekly?.day ?? 'sunday',
      time: n.digestSchedule?.weekly?.time ?? '18:00',
    },
    types,
    timezone: settings.timezone ?? deviceTimezone,
  };
}

/** Full-replacement PUT body for everything the screen edits. */
export function buildUpdate(draft: INotificationDraft): IUserSettingsUpdateRequest {
  return {
    timezone: draft.timezone,
    notifications: {
      push: draft.push,
      quietHours: draft.quietHours,
      digestSchedule: {
        daily: draft.dailyDigest,
        weekly: draft.weeklyDigest,
      },
    },
    alerts: { enabledTypes: draft.types },
  };
}

export function isDirty(a: INotificationDraft, b: INotificationDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function setTypeEnabled(
  draft: INotificationDraft,
  key: string,
  enabled: boolean
): INotificationDraft {
  const current = draft.types[key] ?? { enabled: true, severity: 'info' };
  return { ...draft, types: { ...draft.types, [key]: { ...current, enabled } } };
}

// ---------------------------------------------------------------------------
// Time helpers (HH:mm, 24-hour on the wire)
// ---------------------------------------------------------------------------

const HHMM = /^(\d{2}):(\d{2})$/;

export function parseMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return 0;
  return h * 60 + min;
}

export function toHhmm(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Moves a time by `deltaMinutes`, wrapping at midnight. */
export function stepTime(hhmm: string, deltaMinutes: number): string {
  return toHhmm(parseMinutes(hhmm) + deltaMinutes);
}

/** `22:00` -> `10:00 PM`. */
export function formatTime12(hhmm: string): string {
  const total = parseMinutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function quietHoursSummary(q: ISettingsQuietHours): string {
  if (!q.enabled) return 'Off';
  return `${formatTime12(q.start)} to ${formatTime12(q.end)}`;
}

// ---------------------------------------------------------------------------
// OS permission + timezone
// ---------------------------------------------------------------------------

export interface IPushPermissionView {
  readonly label: string;
  readonly granted: boolean;
  readonly hint: string;
}

/** Maps expo-notifications permission status to copy. */
export function pushPermissionView(status: string): IPushPermissionView {
  if (status === 'granted') {
    return { label: 'Allowed', granted: true, hint: 'This device can receive alerts.' };
  }
  if (status === 'denied') {
    return {
      label: 'Blocked',
      granted: false,
      hint: 'Turn notifications on for Scholarmancy in your device settings.',
    };
  }
  if (status === 'undetermined') {
    return {
      label: 'Not asked yet',
      granted: false,
      hint: 'Open your device settings to allow notifications.',
    };
  }
  return { label: 'Unknown', granted: false, hint: 'Check notifications in your device settings.' };
}

/** True when the account timezone differs from this device's. */
export function timezoneMismatch(draftTimezone: string, deviceTimezone: string): boolean {
  return deviceTimezone !== '' && draftTimezone !== deviceTimezone;
}

/** Device IANA timezone; Intl can be missing or empty on odd runtimes. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}
