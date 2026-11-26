/**
 * Pure model for the notification settings screen: server response -> editable
 * draft -> PUT /api/settings body. No React, no network.
 */

import {
  AlertType,
  buildSmsOptInLabelHtml,
  alertTypeLabel,
  type IMySharingStudent,
  type IMySharingView,
  type ISettingsAlertTypePref,
  type ISettingsQuietHours,
  type IUserSettingsResponse,
  type IUserSettingsUpdateRequest,
  type SharingAlertChannel,
  type StudentAccess,
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

/** Same words as the web opt-in checkbox, so the consent a parent gives is the same everywhere. */
export const SMS_CONSENT_LABEL = buildSmsOptInLabelHtml();

/** Android has no Firebase in 1.0, so push cannot register there; texts carry the alerts. */
export function pushSectionVisible(platform: string): boolean {
  return platform !== 'android';
}

/** Asked for only when opting in; the server does the strict check. US numbers only (US-only launch). */
export function smsOptInError(draft: Pick<INotificationDraft, 'smsOn' | 'phone'>): string | null {
  if (!draft.smsOn) return null;
  const digits = draft.phone.replace(/\D/g, '');
  const ok = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  return ok ? null : 'Enter your US mobile number to get texts.';
}

export interface INotificationDraft {
  /** Text-message alerts on: the sms channel is enabled and consent is recorded. */
  readonly smsOn: boolean;
  readonly phone: string;
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
    smsOn: n.sms === true && settings.profile?.smsConsent === true,
    phone: settings.profile?.phone ?? '',
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
export function buildUpdate(
  draft: INotificationDraft,
  saved?: INotificationDraft
): IUserSettingsUpdateRequest {
  // Consent goes to the server only when the text settings changed: every send records an opt-in.
  const smsChanged =
    saved !== undefined && (draft.smsOn !== saved.smsOn || draft.phone !== saved.phone);
  return {
    timezone: draft.timezone,
    ...(smsChanged ? { profile: { phone: draft.phone.trim(), smsConsent: draft.smsOn } } : {}),
    notifications: {
      sms: draft.smsOn,
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
// Weekly review copy (student review spec §3.3, decision Q2): one switch per student
// ---------------------------------------------------------------------------

export const WEEKLY_REVIEW_SWITCH_LABEL = 'Send me the weekly review';
export const WEEKLY_REVIEW_SECTION_HINT =
  'Students get their own review on Sunday evening. Turn this on to get a copy by your alert channels.';

export interface IWeeklyReviewRow {
  readonly studentId: string;
  readonly name: string;
  readonly access: StudentAccess;
  readonly enabled: boolean;
  readonly receiveAlerts: boolean;
  readonly alertChannels: readonly SharingAlertChannel[];
  readonly alertTypes?: readonly string[];
  /** The invite address on the caller's own sharedWith row; what the contacts PUT keys on. */
  readonly contactEmail?: string;
}

/** One row per accessible student from `GET /api/sharing/mine`, by name. */
export function weeklyReviewRows(view: IMySharingView): readonly IWeeklyReviewRow[] {
  return view.students
    .map((s: IMySharingStudent): IWeeklyReviewRow => ({
      studentId: s.studentId,
      name: s.name,
      access: s.access,
      enabled: s.alerts.weeklyReviewCopy === true,
      receiveAlerts: s.alerts.receiveAlerts,
      alertChannels: s.alerts.alertChannels,
      ...(s.alerts.alertTypes !== undefined ? { alertTypes: s.alerts.alertTypes } : {}),
      ...(s.contactEmail !== undefined && s.contactEmail !== ''
        ? { contactEmail: s.contactEmail }
        : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The PUT that flips one student's switch. The owner's prefs endpoint replaces the whole
 * object, so the current channels travel with the toggle; a shared adult's row is merged
 * server-side and needs only the toggle.
 */
export type WeeklyReviewToggleRequest =
  | {
      readonly kind: 'owner';
      readonly studentId: string;
      readonly body: {
        readonly receiveAlerts: boolean;
        readonly alertChannels: readonly SharingAlertChannel[];
        readonly alertTypes?: readonly string[];
        readonly weeklyReviewCopy: boolean;
      };
    }
  | {
      readonly kind: 'contact';
      readonly studentId: string;
      /** The row's invite address from /api/sharing/mine; absent when the server did not say. */
      readonly email?: string;
      readonly body: { readonly weeklyReviewCopy: boolean };
    };

export function weeklyReviewToggleRequest(
  row: IWeeklyReviewRow,
  enabled: boolean
): WeeklyReviewToggleRequest {
  if (row.access === 'owner') {
    return {
      kind: 'owner',
      studentId: row.studentId,
      body: {
        receiveAlerts: row.receiveAlerts,
        alertChannels: row.alertChannels,
        ...(row.alertTypes !== undefined ? { alertTypes: row.alertTypes } : {}),
        weeklyReviewCopy: enabled,
      },
    };
  }
  return {
    kind: 'contact',
    studentId: row.studentId,
    ...(row.contactEmail !== undefined ? { email: row.contactEmail } : {}),
    body: { weeklyReviewCopy: enabled },
  };
}

export function setWeeklyReviewEnabled(
  rows: readonly IWeeklyReviewRow[],
  studentId: string,
  enabled: boolean
): readonly IWeeklyReviewRow[] {
  return rows.map((row) => (row.studentId === studentId ? { ...row, enabled } : row));
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
