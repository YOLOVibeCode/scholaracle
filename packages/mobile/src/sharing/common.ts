/**
 * Shared by the sharing models: the alert channel list and its labels, list toggling, and
 * joining names in prose. Pure.
 */

import type { SharingAlertChannel } from '@scholaracle/contracts';

/** Every channel an adult may pick, in display order. */
export const ALERT_CHANNELS: readonly {
  readonly value: SharingAlertChannel;
  readonly text: string;
}[] = [
  { value: 'email', text: 'Email' },
  { value: 'push', text: 'Push' },
  { value: 'sms', text: 'Text' },
];

export function channelText(channel: SharingAlertChannel): string {
  return ALERT_CHANNELS.find((c) => c.value === channel)?.text ?? channel;
}

/** Adds `item` when absent, removes it when present; order of the rest is kept. */
export function toggleInList<T>(list: readonly T[], item: T): readonly T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** "Ava" · "Ava and Christian" · "Ava, Christian and Gideon". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}
