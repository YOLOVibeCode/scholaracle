/**
 * An adult's own alert settings for one student: the contact row's `receiveAlerts`,
 * `alertChannels`, `alertTypes`. Used by the Family & guardians "My alerts" panel and the
 * per-student sections of Notification settings. Pure: no React, no network.
 */

import type {
  ISharingContactUpdateRequest,
  ISharingMyAlerts,
  ISharingPerson,
  SharingAlertChannel,
} from '@scholaracle/contracts';
import { ALERT_TYPE_KEYS, alertTypeToggleLabel } from '../alerts/notificationSettingsModel';

export interface IMyAlertsDraft {
  readonly receiveAlerts: boolean;
  readonly channels: readonly SharingAlertChannel[];
  /** null = every alert type (the server's meaning of an absent `alertTypes`). */
  readonly types: readonly string[] | null;
}

export const MY_ALERT_CHANNELS: readonly {
  readonly value: SharingAlertChannel;
  readonly text: string;
}[] = [
  { value: 'email', text: 'Email' },
  { value: 'push', text: 'Push' },
  { value: 'sms', text: 'Text' },
];

/** Channels restored by "Turn alerts back on" when the row had none (owner decision: email + push). */
export const DEFAULT_MY_CHANNELS: readonly SharingAlertChannel[] = ['email', 'push'];

export function draftFromPerson(
  person: Pick<ISharingPerson, 'receiveAlerts' | 'alertChannels' | 'alertTypes'>
): IMyAlertsDraft {
  return {
    receiveAlerts: person.receiveAlerts !== false,
    channels: person.alertChannels ?? ['email'],
    types: person.alertTypes ? [...person.alertTypes] : null,
  };
}

export function draftFromMyAlerts(alerts: ISharingMyAlerts): IMyAlertsDraft {
  return {
    receiveAlerts: alerts.receiveAlerts,
    channels: alerts.alertChannels,
    types: alerts.alertTypes ? [...alerts.alertTypes] : null,
  };
}

/** Silenced = alerts off or no channel left (sharing-spec §4.2). */
export function isSilenced(draft: IMyAlertsDraft): boolean {
  return !draft.receiveAlerts || draft.channels.length === 0;
}

/** One tap: alerts off, every channel off; the type choices are kept for later. */
export function silence(draft: IMyAlertsDraft): IMyAlertsDraft {
  return { ...draft, receiveAlerts: false, channels: [] };
}

export function unsilence(draft: IMyAlertsDraft): IMyAlertsDraft {
  return {
    ...draft,
    receiveAlerts: true,
    channels: draft.channels.length > 0 ? draft.channels : DEFAULT_MY_CHANNELS,
  };
}

export function toggleChannel(draft: IMyAlertsDraft, channel: SharingAlertChannel): IMyAlertsDraft {
  const channels = draft.channels.includes(channel)
    ? draft.channels.filter((c) => c !== channel)
    : [...draft.channels, channel];
  // Turning a channel on also turns alerts on: that is what the tap meant.
  return { ...draft, channels, receiveAlerts: channels.length > 0 ? true : draft.receiveAlerts };
}

export function typeEnabled(draft: IMyAlertsDraft, key: string): boolean {
  return draft.types === null || draft.types.includes(key);
}

export function setTypeEnabled(
  draft: IMyAlertsDraft,
  key: string,
  enabled: boolean
): IMyAlertsDraft {
  const current = draft.types ?? [...ALERT_TYPE_KEYS];
  const next = enabled
    ? current.includes(key)
      ? current
      : [...current, key]
    : current.filter((k) => k !== key);
  // Every known type on again = back to "all" (so new server types are not silently excluded).
  const allOn = ALERT_TYPE_KEYS.every((k) => next.includes(k));
  return { ...draft, types: allOn ? null : next };
}

/** Body for PUT /api/students/:id/contacts/:email (self) or /owner-alert-prefs. */
export function buildContactPrefsUpdate(draft: IMyAlertsDraft): ISharingContactUpdateRequest {
  return {
    receiveAlerts: draft.receiveAlerts,
    alertChannels: draft.channels,
    ...(draft.types !== null ? { alertTypes: draft.types } : {}),
  };
}

export function myAlertsDirty(a: IMyAlertsDraft, b: IMyAlertsDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function channelWord(channel: SharingAlertChannel): string {
  return MY_ALERT_CHANNELS.find((c) => c.value === channel)?.text.toLowerCase() ?? channel;
}

/** "Silenced" · "Email and push" · "Email, text and push · 3 of 8 types". */
export function alertsSummary(draft: IMyAlertsDraft): string {
  if (isSilenced(draft)) return 'Silenced';
  const ordered = MY_ALERT_CHANNELS.map((c) => c.value).filter((c) => draft.channels.includes(c));
  const words = ordered.map(channelWord);
  const channels =
    words.length === 1
      ? words[0]!
      : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]!}`;
  const capitalized = channels.charAt(0).toUpperCase() + channels.slice(1);
  if (draft.types === null) return capitalized;
  return `${capitalized} · ${draft.types.length} of ${ALERT_TYPE_KEYS.length} types`;
}

/** Keys + labels for the type switches, contracts order. */
export function alertTypeRows(): readonly { readonly key: string; readonly label: string }[] {
  return ALERT_TYPE_KEYS.map((key) => ({ key, label: alertTypeToggleLabel(key) }));
}

export function silenceButtonLabel(draft: IMyAlertsDraft, studentName: string): string {
  return isSilenced(draft) ? `Turn alerts for ${studentName} back on` : `Silence ${studentName}`;
}
