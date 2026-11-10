/**
 * Students screen copy for sharing: the "Shared with you · by …" line, the people count and
 * the empty-state text. The data itself (students, invitations, inviter names) lives in
 * App's home state: see homeData.ts. Pure.
 */

import type { IMySharingStudent, IStudentListItem } from '@scholaracle/contracts';
import { canInvite } from './accessMatrix';

/** The web phase adds `invitedBy` to the list item; tolerate builds of the API without it. */
export interface IStudentListItemWithInviter extends IStudentListItem {
  readonly invitedBy?: {
    readonly userId: string;
    readonly name?: string;
  };
}

/** Inviter name from the list item, else from GET /api/sharing/mine. */
export function inviterName(
  item: IStudentListItemWithInviter,
  mine?: readonly IMySharingStudent[] | null
): string | undefined {
  const own = item.invitedBy?.name?.trim();
  if (own) return own;
  const fromMine = mine?.find((s) => s.studentId === item.id)?.invitedBy?.name?.trim();
  return fromMine || undefined;
}

/** "Shared with you · by Ricardo" under a shared student; null for an owned one. */
export function sharedWithYouLine(
  item: IStudentListItemWithInviter,
  mine?: readonly IMySharingStudent[] | null
): string | null {
  if (item.access === 'owner') return null;
  const by = inviterName(item, mine);
  return by ? `Shared with you · by ${by}` : 'Shared with you';
}

/** "Shared with 2 people" under an owned student that others follow; null otherwise. */
export function peopleLine(item: Pick<IStudentListItem, 'access' | 'peopleCount'>): string | null {
  if (item.access !== 'owner' || item.peopleCount <= 1) return null;
  const others = item.peopleCount - 1;
  return others === 1 ? 'Shared with 1 person' : `Shared with ${others} people`;
}

export function studentSubline(
  item: IStudentListItemWithInviter,
  mine?: readonly IMySharingStudent[] | null
): string | null {
  return sharedWithYouLine(item, mine) ?? peopleLine(item);
}

/** True when a shared student lacks an inviter name, so GET /api/sharing/mine is worth a call. */
export function needsInviterNames(items: readonly IStudentListItemWithInviter[]): boolean {
  return items.some((item) => item.access !== 'owner' && !item.invitedBy?.name?.trim());
}

/** The "Share…" entry shows when the viewer can share at least one student. */
export function anyShareable(items: readonly Pick<IStudentListItem, 'access'>[]): boolean {
  return items.some((item) => canInvite(item.access));
}

/** Empty-state copy on the Students screen. */
export function emptyStudentsText(pendingInviteCount: number): string {
  if (pendingInviteCount > 0) {
    return 'Accept an invitation above to follow a student, or set up your own.';
  }
  return 'Add your kids and connect the school portal. It takes a few minutes.';
}
