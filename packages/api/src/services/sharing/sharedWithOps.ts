import type { ISharedParent, SharedAlertChannel, Student } from '@scholaracle/database';

/**
 * Pure helpers over `Student.sharedWith`. Every route that changes an entry goes through these so
 * accept / decline / remove behave the same on `/contacts`, `/parents` and `/api/sharing`.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findPendingEntry(student: Student, email: string): ISharedParent | undefined {
  const target = normalizeEmail(email);
  return student.sharedWith.find((sp) => sp.email === target && sp.status === 'pending');
}

/** Channels a newly accepted adult gets when the invitation did not choose any (spec §8 Q4). */
export const DEFAULT_ACCEPTED_ALERT_CHANNELS: readonly SharedAlertChannel[] = ['email', 'push'];

/** Accepts the pending entry for `email`, binding it to `userId`. Null when nothing is pending. */
export function acceptedSharedWith(
  student: Student,
  email: string,
  userId: string,
  acceptedAt: Date = new Date()
): readonly ISharedParent[] | null {
  const target = normalizeEmail(email);
  const idx = student.sharedWith.findIndex((sp) => sp.email === target && sp.status === 'pending');
  if (idx === -1) return null;
  const next = [...student.sharedWith];
  const current = next[idx]!;
  next[idx] = {
    ...current,
    userId,
    status: 'accepted',
    acceptedAt,
    receiveAlerts: current.receiveAlerts !== false,
    alertChannels: current.alertChannels ?? DEFAULT_ACCEPTED_ALERT_CHANNELS,
  };
  return next;
}

/** Marks the pending entry for `email` declined. Null when nothing is pending. */
export function declinedSharedWith(
  student: Student,
  email: string
): readonly ISharedParent[] | null {
  const target = normalizeEmail(email);
  const idx = student.sharedWith.findIndex((sp) => sp.email === target && sp.status === 'pending');
  if (idx === -1) return null;
  const next = [...student.sharedWith];
  next[idx] = { ...next[idx]!, status: 'declined' };
  return next;
}

/** Removes every entry for `email`. Null when there was none. */
export function removedSharedWith(
  student: Student,
  email: string
): readonly ISharedParent[] | null {
  const target = normalizeEmail(email);
  const next = student.sharedWith.filter((sp) => sp.email !== target);
  return next.length === student.sharedWith.length ? null : next;
}
