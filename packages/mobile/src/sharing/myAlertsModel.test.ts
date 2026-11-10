import { ALERT_TYPE_KEYS } from '../alerts/notificationSettingsModel';
import {
  alertTypeRows,
  alertsSummary,
  buildContactPrefsUpdate,
  draftFromMyAlerts,
  draftFromPerson,
  isSilenced,
  myAlertsDirty,
  setTypeEnabled,
  silence,
  silenceButtonLabel,
  toggleChannel,
  typeEnabled,
  unsilence,
  type IMyAlertsDraft,
} from './myAlertsModel';

const base: IMyAlertsDraft = { receiveAlerts: true, channels: ['email', 'push'], types: null };

describe('drafts', () => {
  it('reads a contact row with the server defaults (alerts on, email, all types)', () => {
    expect(draftFromPerson({})).toEqual({ receiveAlerts: true, channels: ['email'], types: null });
    expect(
      draftFromPerson({ receiveAlerts: false, alertChannels: ['sms'], alertTypes: ['grade_drop'] })
    ).toEqual({ receiveAlerts: false, channels: ['sms'], types: ['grade_drop'] });
  });

  it('reads the /sharing/mine shape', () => {
    expect(draftFromMyAlerts({ receiveAlerts: true, alertChannels: ['email', 'push'] })).toEqual(
      base
    );
  });
});

describe('silence', () => {
  it('is silenced when alerts are off or no channel is left', () => {
    expect(isSilenced(base)).toBe(false);
    expect(isSilenced({ ...base, receiveAlerts: false })).toBe(true);
    expect(isSilenced({ ...base, channels: [] })).toBe(true);
  });

  it('silence turns everything off in one step and keeps the type choices', () => {
    const typed = { ...base, types: ['grade_drop'] };
    expect(silence(typed)).toEqual({ receiveAlerts: false, channels: [], types: ['grade_drop'] });
  });

  it('unsilence restores the previous channels, or email + push when none were left', () => {
    expect(unsilence({ receiveAlerts: false, channels: ['sms'], types: null })).toEqual({
      receiveAlerts: true,
      channels: ['sms'],
      types: null,
    });
    expect(unsilence({ receiveAlerts: false, channels: [], types: null })).toEqual({
      receiveAlerts: true,
      channels: ['email', 'push'],
      types: null,
    });
  });

  it('labels the one-tap button', () => {
    expect(silenceButtonLabel(base, 'Ava')).toBe('Silence Ava');
    expect(silenceButtonLabel(silence(base), 'Ava')).toBe('Turn alerts for Ava back on');
  });
});

describe('channels and types', () => {
  it('toggling a channel on also turns alerts back on', () => {
    const off = silence(base);
    const next = toggleChannel(off, 'push');
    expect(next.channels).toEqual(['push']);
    expect(next.receiveAlerts).toBe(true);
    expect(toggleChannel(base, 'email').channels).toEqual(['push']);
  });

  it('null types mean every type; disabling one expands the list', () => {
    expect(typeEnabled(base, 'grade_drop')).toBe(true);
    const next = setTypeEnabled(base, 'grade_drop', false);
    expect(next.types).toEqual(ALERT_TYPE_KEYS.filter((k) => k !== 'grade_drop'));
    expect(typeEnabled(next, 'grade_drop')).toBe(false);
    expect(typeEnabled(next, 'deadline')).toBe(true);
  });

  it('re-enabling the last missing type collapses back to "all"', () => {
    const partial = setTypeEnabled(base, 'grade_drop', false);
    expect(setTypeEnabled(partial, 'grade_drop', true).types).toBeNull();
    // Enabling an already enabled type is a no-op on the list.
    expect(setTypeEnabled(partial, 'deadline', true).types).toEqual(partial.types);
  });

  it('lists the type rows from contracts', () => {
    const rows = alertTypeRows();
    expect(rows.map((r) => r.key)).toEqual(ALERT_TYPE_KEYS);
    expect(rows.find((r) => r.key === 'grade_drop')?.label).toBe('Grade drops');
  });
});

describe('update body and summary', () => {
  it('builds the PUT body, omitting alertTypes for "all"', () => {
    // "All types" travels as an explicit null: the PUT is a patch, and an absent key could
    // never widen a previously narrowed list.
    expect(buildContactPrefsUpdate(base)).toEqual({
      receiveAlerts: true,
      alertChannels: ['email', 'push'],
      alertTypes: null,
    });
    expect(buildContactPrefsUpdate({ ...base, types: ['grade_drop'] })).toEqual({
      receiveAlerts: true,
      alertChannels: ['email', 'push'],
      alertTypes: ['grade_drop'],
    });
    expect(buildContactPrefsUpdate(silence(base))).toEqual({
      receiveAlerts: false,
      alertChannels: [],
      alertTypes: null,
    });
  });

  it('summarises the settings', () => {
    expect(alertsSummary(base)).toBe('Email and push');
    expect(alertsSummary({ ...base, channels: ['sms'] })).toBe('Text');
    expect(alertsSummary({ ...base, channels: ['sms', 'email', 'push'] })).toBe(
      'Email, push and text'
    );
    expect(alertsSummary({ ...base, types: ['grade_drop', 'deadline', 'test'] })).toBe(
      `Email and push · 3 of ${ALERT_TYPE_KEYS.length} types`
    );
    expect(alertsSummary(silence(base))).toBe('Silenced');
  });

  it('detects changes', () => {
    expect(myAlertsDirty(base, { ...base })).toBe(false);
    expect(myAlertsDirty(base, silence(base))).toBe(true);
  });
});
