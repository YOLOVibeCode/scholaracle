import type { ISharingInviteSelection, ISharingPendingInvite } from '@scholaracle/contracts';

/** One card on /dashboard/invites: the invitation an inviter sent, across its students. */
export interface IPendingInviteGroup {
  /** Stable key for React and test ids. */
  readonly key: string;
  readonly inviterName: string;
  readonly students: readonly { readonly id: string; readonly name: string }[];
  readonly isAdmin: boolean;
  readonly label: ISharingPendingInvite['invite']['role'];
  readonly invitedAt: string;
  /** What to send to accept / decline this card. */
  readonly selection: ISharingInviteSelection;
}

/**
 * Group pending invitations into cards. Entries that share an `inviteGroupId` were one
 * invitation; older entries without one become a card per inviter.
 */
export function groupPendingInvites(
  invites: readonly ISharingPendingInvite[]
): readonly IPendingInviteGroup[] {
  const byKey = new Map<string, ISharingPendingInvite[]>();
  for (const invite of invites) {
    const key = invite.inviteGroupId ?? `by:${invite.invitedBy}`;
    const list = byKey.get(key);
    if (list) list.push(invite);
    else byKey.set(key, [invite]);
  }
  return [...byKey.entries()].map(([key, group]) => {
    const first = group[0]!;
    const sorted = [...group].sort((a, b) => a.invite.invitedAt.localeCompare(b.invite.invitedAt));
    return {
      key,
      inviterName: first.invitedByName ?? 'A parent',
      students: sorted.map((g) => ({ id: g.studentId, name: g.studentName })),
      isAdmin: group.some((g) => g.invite.isAdmin),
      label: first.invite.role,
      invitedAt: sorted[0]!.invite.invitedAt,
      selection: first.inviteGroupId
        ? { inviteGroupId: first.inviteGroupId }
        : { studentIds: group.map((g) => g.studentId) },
    };
  });
}

/** "Ava", "Ava and Christian", "Ava, Christian and Gideon". */
export function joinNames(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter((n) => n !== '');
  if (clean.length === 0) return 'a student';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]!}`;
}
