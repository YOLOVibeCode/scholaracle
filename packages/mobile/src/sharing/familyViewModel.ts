/**
 * Family & guardians list: one row per person with chips and the actions the viewer may take
 * (sharing-spec §4.2, §4.9). Pure: no React, no network.
 */

import type { ContactSmsStatus, ISharingPerson, StudentAccess } from '@scholaracle/contracts';
import { accessLabel, accessOf, canManagePeople } from './accessMatrix';
import { labelText } from './invitationGroups';

export type FamilyAction =
  'resend' | 'reinvite' | 'make-admin' | 'remove-admin' | 'remove' | 'my-alerts' | 'leave';

export interface IFamilyViewer {
  readonly userId: string;
  readonly email: string;
  readonly access: StudentAccess;
}

export interface IFamilyRow {
  readonly key: string;
  readonly person: ISharingPerson;
  readonly displayName: string;
  /** The email when a name is shown above it. */
  readonly secondary?: string;
  readonly isYou: boolean;
  readonly roleChip: 'Owner' | 'Admin' | 'Member';
  readonly labelChip: string;
  /** Hidden for the owner (always accepted). */
  readonly statusChip: 'Invited' | 'Accepted' | 'Declined' | null;
  /** Hidden for the owner (no texting consent row). */
  readonly textsChip: string | null;
  readonly actions: readonly FamilyAction[];
}

const STATUS_CHIP: Readonly<Record<ISharingPerson['status'], IFamilyRow['statusChip']>> = {
  pending: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
};

const TEXTS_CHIP: Readonly<Record<ContactSmsStatus, string>> = {
  none: 'Texts: none',
  invited: 'Texts: invited',
  opted_in: 'Texts: opted in',
  opted_out: 'Texts: opted out',
};

export function textsChipText(status: ContactSmsStatus | undefined): string {
  return TEXTS_CHIP[status ?? 'none'];
}

export function isViewer(
  person: ISharingPerson,
  viewer: Pick<IFamilyViewer, 'userId' | 'email'>
): boolean {
  if (person.userId !== undefined && person.userId !== '' && person.userId === viewer.userId) {
    return true;
  }
  const email = viewer.email.trim().toLowerCase();
  return email !== '' && person.email?.toLowerCase() === email;
}

function ownRowActions(person: ISharingPerson): readonly FamilyAction[] {
  // The owner edits their alerts here too; they cannot leave their own student.
  return person.isOwner ? ['my-alerts'] : ['my-alerts', 'leave'];
}

function managedRowActions(person: ISharingPerson): readonly FamilyAction[] {
  if (person.isOwner) return [];
  if (person.status === 'pending') return ['resend', 'remove'];
  if (person.status === 'declined') return ['reinvite', 'remove'];
  return [person.isAdmin ? 'remove-admin' : 'make-admin', 'remove'];
}

export function rowActions(person: ISharingPerson, viewer: IFamilyViewer): readonly FamilyAction[] {
  if (isViewer(person, viewer)) return ownRowActions(person);
  return canManagePeople(viewer.access) ? managedRowActions(person) : [];
}

const ORDER: Readonly<Record<ISharingPerson['status'], number>> = {
  accepted: 1,
  pending: 2,
  declined: 3,
};

function sortRank(person: ISharingPerson): number {
  return person.isOwner ? 0 : ORDER[person.status];
}

export function displayNameOf(person: ISharingPerson): string {
  const name = person.name?.trim();
  if (name) return name;
  if (person.email) return person.email;
  return person.isOwner ? 'Owner' : 'Someone';
}

export function familyRow(person: ISharingPerson, viewer: IFamilyViewer): IFamilyRow {
  const name = person.name?.trim();
  return {
    key: person.email ?? `owner:${person.userId ?? ''}`,
    person,
    displayName: displayNameOf(person),
    ...(name && person.email ? { secondary: person.email } : {}),
    isYou: isViewer(person, viewer),
    roleChip: accessLabel(accessOf(person)),
    labelChip: labelText(person.role),
    statusChip: person.isOwner ? null : STATUS_CHIP[person.status],
    textsChip: person.isOwner ? null : textsChipText(person.smsStatus),
    actions: rowActions(person, viewer),
  };
}

/** Owner first, then accepted, invited, declined; by name within each group. */
export function familyRows(
  people: readonly ISharingPerson[],
  viewer: IFamilyViewer
): readonly IFamilyRow[] {
  return people
    .map((person) => familyRow(person, viewer))
    .sort(
      (a, b) =>
        sortRank(a.person) - sortRank(b.person) || a.displayName.localeCompare(b.displayName)
    );
}

const ACTION_LABELS: Readonly<Record<FamilyAction, string>> = {
  resend: 'Resend invitation',
  reinvite: 'Invite again',
  'make-admin': 'Make admin',
  'remove-admin': 'Remove admin',
  remove: 'Remove',
  'my-alerts': 'My alerts',
  leave: 'Leave',
};

export function familyActionLabel(action: FamilyAction): string {
  return ACTION_LABELS[action];
}

export function isDestructiveAction(action: FamilyAction): boolean {
  return action === 'remove' || action === 'leave';
}

export function familyTitle(studentName: string): string {
  return `Family & guardians · ${studentName}`;
}

/** "3 people · 1 invited" (accepted adults incl. the owner, plus pending). */
export function peopleSummary(people: readonly ISharingPerson[]): string {
  const accepted = people.filter((p) => p.isOwner || p.status === 'accepted').length;
  const pending = people.filter((p) => !p.isOwner && p.status === 'pending').length;
  const head = accepted === 1 ? '1 person' : `${accepted} people`;
  return pending > 0 ? `${head} · ${pending} invited` : head;
}

export function leaveConfirmText(studentName: string): string {
  return `You will stop following ${studentName}: no more alerts, and ${studentName} leaves your Students list. The owner is told. You can be invited again later.`;
}

export function removePersonConfirmText(displayName: string, studentName: string): string {
  return `${displayName} will lose access to ${studentName} right away, and their alerts and sign-in links stop. You can invite them again later.`;
}

export function adminChangeConfirmText(displayName: string, makeAdmin: boolean): string {
  return makeAdmin
    ? `${displayName} will be able to edit the student, connect portals and invite or remove people. Only you can remove the student.`
    : `${displayName} will keep seeing everything but can no longer edit the student, connect portals or manage people.`;
}
