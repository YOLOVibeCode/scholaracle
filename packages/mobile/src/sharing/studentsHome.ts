/**
 * Students screen copy and gates for sharing: the "Shared with you · by …" line, the people
 * count, the invitations banner, and the onboarding gate (a new co-parent with no students of
 * their own but a pending invitation must see the Students screen, not onboarding).
 * Pure except `loadHomeCounts`, which takes the client as a parameter.
 */

import type {
  IMySharingStudent,
  ISharingPendingInvite,
  IStudentListItem,
} from '@scholaracle/contracts';
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

export interface IHomeCounts {
  readonly students: number;
  readonly pendingInvites: number;
}

export interface IHomeCountsApi {
  getStudents(): Promise<readonly IStudentListItem[]>;
  getPendingSharingInvites(): Promise<readonly ISharingPendingInvite[]>;
}

/**
 * Students on the account and, only when there are none, pending invitations (so the
 * onboarding gate can let an invitee through). A failing invites call counts as zero.
 */
export async function loadHomeCounts(api: IHomeCountsApi): Promise<IHomeCounts> {
  const students = (await api.getStudents()).length;
  if (students > 0) return { students, pendingInvites: 0 };
  const pending = await api.getPendingSharingInvites().catch(() => []);
  return { students, pendingInvites: pending.length };
}

/**
 * Show onboarding (no students yet) unless an invitation is waiting; "Get started" on the
 * Students screen sets `setupRequested` to reach onboarding anyway.
 */
export function showOnboardingGate(args: {
  readonly studentCount: number;
  readonly pendingInviteCount: number;
  readonly setupRequested: boolean;
}): boolean {
  if (args.studentCount !== 0) return false;
  return args.pendingInviteCount === 0 || args.setupRequested;
}

/** Empty-state copy on the Students screen. */
export function emptyStudentsText(pendingInviteCount: number): string {
  if (pendingInviteCount > 0) {
    return 'Accept an invitation above to follow a student, or set up your own.';
  }
  return 'Add your kids and connect the school portal. It takes a few minutes.';
}
