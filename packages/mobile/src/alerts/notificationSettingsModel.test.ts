import type { IUserSettingsResponse } from '@scholaracle/contracts';
import {
  ALERT_TYPE_KEYS,
  alertTypeToggleLabel,
  buildUpdate,
  deviceTimezone,
  draftFromSettings,
  formatTime12,
  isDirty,
  parseMinutes,
  pushPermissionView,
  quietHoursSummary,
  setTypeEnabled,
  stepTime,
  timezoneMismatch,
  toHhmm,
} from './notificationSettingsModel';

const SETTINGS: IUserSettingsResponse = {
  timezone: 'America/Chicago',
  notifications: {
    push: true,
    email: true,
    sms: false,
    quietHours: { enabled: true, start: '21:30', end: '06:00', criticalOverride: false },
    digestSchedule: {
      daily: { enabled: false, time: '08:00' },
      weekly: { enabled: true, day: 'friday', time: '17:00' },
    },
  },
  alerts: {
    gradeDrop: 5,
    daysBeforeDeadline: 2,
    lowGradeThreshold: 80,
    enabledTypes: {
      grade_drop: { enabled: false, severity: 'critical' },
      custom_type: { enabled: true, severity: 'warning' },
    },
  },
};

describe('draftFromSettings', () => {
  it('maps server settings and fills missing alert types with defaults', () => {
    const draft = draftFromSettings(SETTINGS, 'UTC');
    expect(draft.push).toBe(true);
    expect(draft.quietHours).toEqual({
      enabled: true,
      start: '21:30',
      end: '06:00',
      criticalOverride: false,
    });
    expect(draft.dailyDigest).toEqual({ enabled: false, time: '08:00' });
    expect(draft.weeklyDigest).toEqual({ enabled: true, day: 'friday', time: '17:00' });
    expect(draft.timezone).toBe('America/Chicago');
    expect(draft.types['grade_drop']).toEqual({ enabled: false, severity: 'critical' });
    expect(draft.types['deadline']).toEqual({ enabled: true, severity: 'info' });
    expect(Object.keys(draft.types)).toEqual(expect.arrayContaining([...ALERT_TYPE_KEYS]));
    // Unknown server-side types survive a round trip.
    expect(draft.types['custom_type']).toEqual({ enabled: true, severity: 'warning' });
  });

  it('uses defaults and the device timezone when the server omits fields', () => {
    const draft = draftFromSettings(
      { notifications: { push: false, email: true, sms: false }, alerts: SETTINGS.alerts },
      'Europe/Paris'
    );
    expect(draft.timezone).toBe('Europe/Paris');
    expect(draft.quietHours).toEqual({
      enabled: true,
      start: '22:00',
      end: '07:00',
      criticalOverride: true,
    });
    expect(draft.dailyDigest).toEqual({ enabled: true, time: '07:00' });
    expect(draft.weeklyDigest).toEqual({ enabled: true, day: 'sunday', time: '18:00' });
  });

  it('handles alerts without enabledTypes', () => {
    const draft = draftFromSettings(
      {
        notifications: SETTINGS.notifications,
        alerts: { gradeDrop: 1, daysBeforeDeadline: 1, lowGradeThreshold: 1 },
      },
      'UTC'
    );
    expect(Object.keys(draft.types)).toHaveLength(ALERT_TYPE_KEYS.length);
  });
});

describe('buildUpdate / dirty tracking', () => {
  it('produces a PUT body carrying every edited field', () => {
    const draft = setTypeEnabled(draftFromSettings(SETTINGS, 'UTC'), 'deadline', false);
    const body = buildUpdate(draft);
    expect(body.timezone).toBe('America/Chicago');
    expect(body.notifications).toEqual({
      push: true,
      quietHours: SETTINGS.notifications.quietHours,
      digestSchedule: {
        daily: { enabled: false, time: '08:00' },
        weekly: { enabled: true, day: 'friday', time: '17:00' },
      },
    });
    expect(body.alerts?.enabledTypes?.['deadline']).toEqual({ enabled: false, severity: 'info' });
    expect(body.alerts?.enabledTypes?.['custom_type']).toBeDefined();
  });

  it('detects changes', () => {
    const a = draftFromSettings(SETTINGS, 'UTC');
    expect(isDirty(a, draftFromSettings(SETTINGS, 'UTC'))).toBe(false);
    expect(isDirty(setTypeEnabled(a, 'test', false), a)).toBe(true);
  });

  it('setTypeEnabled creates an entry for an unknown key and keeps severity', () => {
    const a = draftFromSettings(SETTINGS, 'UTC');
    expect(setTypeEnabled(a, 'grade_drop', true).types['grade_drop']).toEqual({
      enabled: true,
      severity: 'critical',
    });
    expect(setTypeEnabled(a, 'brand_new', false).types['brand_new']).toEqual({
      enabled: false,
      severity: 'info',
    });
  });
});

describe('time helpers', () => {
  it('parses, wraps and formats', () => {
    expect(parseMinutes('07:30')).toBe(450);
    expect(parseMinutes('bad')).toBe(0);
    expect(parseMinutes('25:00')).toBe(0);
    expect(toHhmm(-30)).toBe('23:30');
    expect(toHhmm(1440 + 60)).toBe('01:00');
    expect(stepTime('23:30', 30)).toBe('00:00');
    expect(stepTime('00:00', -30)).toBe('23:30');
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('12:15')).toBe('12:15 PM');
    expect(formatTime12('22:00')).toBe('10:00 PM');
    expect(formatTime12('07:05')).toBe('7:05 AM');
  });

  it('summarizes quiet hours', () => {
    expect(
      quietHoursSummary({ enabled: false, start: '22:00', end: '07:00', criticalOverride: true })
    ).toBe('Off');
    expect(
      quietHoursSummary({ enabled: true, start: '22:00', end: '07:00', criticalOverride: true })
    ).toBe('10:00 PM to 7:00 AM');
  });
});

describe('permission + timezone', () => {
  it('maps expo permission statuses', () => {
    expect(pushPermissionView('granted')).toMatchObject({ label: 'Allowed', granted: true });
    expect(pushPermissionView('denied')).toMatchObject({ label: 'Blocked', granted: false });
    expect(pushPermissionView('undetermined')).toMatchObject({ label: 'Not asked yet' });
    expect(pushPermissionView('unknown')).toMatchObject({ label: 'Unknown', granted: false });
  });

  it('detects timezone mismatch only when the device zone is known', () => {
    expect(timezoneMismatch('America/Chicago', 'America/Chicago')).toBe(false);
    expect(timezoneMismatch('America/Chicago', 'Europe/Paris')).toBe(true);
    expect(timezoneMismatch('America/Chicago', '')).toBe(false);
  });

  it('reads the device timezone', () => {
    expect(typeof deviceTimezone()).toBe('string');
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no intl');
    });
    expect(deviceTimezone()).toBe('');
    spy.mockRestore();
  });

  it('labels alert types', () => {
    expect(alertTypeToggleLabel('grade_drop')).toBe('Grade drops');
    expect(alertTypeToggleLabel('some_new_one')).toBe('some new one');
  });
});
