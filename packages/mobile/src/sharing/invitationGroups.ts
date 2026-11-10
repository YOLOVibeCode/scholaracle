/**
 * Pending invitations as cards: one per invitation (an `inviteGroupId` spans several students;
 * older single-student entries stand alone). Pure: no React, no network.
 */

import type {
  ISharingInviteSelection,
  ISharingPendingInvite,
  SharingLabel,
} from '@scholaracle/contracts';
import { joinNames } from './common';

export interface IInvitationCard {
  readonly key: string;
  readonly inviteGroupId?: string;
  readonly studentIds: readonly string[];
  readonly studentNames: readonly string[];
  readonly inviterName: string;
  readonly label: SharingLabel;
  readonly isAdmin: boolean;
  /** ISO date of the earliest entry in the group. */
  readonly invitedAt: string;
}

const LABEL_TEXT: Readonly<Record<SharingLabel, string>> = {
  parent: 'Parent',
  guardian: 'Guardian',
  caregiver: 'Caregiver',
};

export function labelText(label: SharingLabel): string {
  return LABEL_TEXT[label];
}

function cardKey(invite: ISharingPendingInvite): string {
  return invite.inviteGroupId ? `group:${invite.inviteGroupId}` : `student:${invite.studentId}`;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Groups by invitation, newest first; students inside a card keep the server's order. */
export function groupPendingInvites(
  invites: readonly ISharingPendingInvite[]
): readonly IInvitationCard[] {
  const cards = new Map<string, IInvitationCard>();
  for (const invite of invites) {
    const key = cardKey(invite);
    const existing = cards.get(key);
    if (existing) {
      cards.set(key, {
        ...existing,
        studentIds: [...existing.studentIds, invite.studentId],
        studentNames: [...existing.studentNames, invite.studentName],
        invitedAt:
          timeOf(invite.invite.invitedAt) < timeOf(existing.invitedAt)
            ? invite.invite.invitedAt
            : existing.invitedAt,
      });
      continue;
    }
    cards.set(key, {
      key,
      ...(invite.inviteGroupId ? { inviteGroupId: invite.inviteGroupId } : {}),
      studentIds: [invite.studentId],
      studentNames: [invite.studentName],
      inviterName: invite.invitedByName?.trim() || 'Someone',
      label: invite.invite.role,
      isAdmin: invite.invite.isAdmin,
      invitedAt: invite.invite.invitedAt,
    });
  }
  return [...cards.values()].sort(
    (a, b) => timeOf(b.invitedAt) - timeOf(a.invitedAt) || a.key.localeCompare(b.key)
  );
}

/** Body for accept / decline: the group when there is one, else the students. */
export function invitationSelection(card: IInvitationCard): ISharingInviteSelection {
  return card.inviteGroupId
    ? { inviteGroupId: card.inviteGroupId }
    : { studentIds: card.studentIds };
}

/** "Ricardo invited you to follow Ava, Christian and Gideon". */
export function invitationTitle(card: IInvitationCard): string {
  return `${card.inviterName} invited you to follow ${joinNames(card.studentNames)}`;
}

/** "Parent · can manage" or "Guardian". */
export function invitationSubtitle(card: IInvitationCard): string {
  return card.isAdmin ? `${labelText(card.label)} · can manage` : labelText(card.label);
}

/** Banner copy on the Students screen; null when nothing is pending. */
export function invitationBannerText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? 'You have 1 invitation' : `You have ${count} invitations`;
}

/** Toast after accepting: "Ava and Christian now appear in your Students list." */
export function acceptedMessage(card: IInvitationCard): string {
  const names = joinNames(card.studentNames);
  return card.studentNames.length === 1
    ? `${names} now appears in your Students list.`
    : `${names} now appear in your Students list.`;
}
