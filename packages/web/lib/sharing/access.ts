import type { ISharingPerson, StudentAccess } from '@scholaracle/contracts';
import type { ISessionUser } from '@/lib/auth/sessionUser';

/**
 * Permission matrix from docs/sharing-spec.md §4.2, as the web applies it. The server enforces
 * every rule again; these only decide which controls to show. Labels never grant rights.
 */

/** Edit name, grade, student id. Owner and admin. */
export function canEditStudent(access: StudentAccess): boolean {
  return access === 'owner' || access === 'admin';
}

/** Remove the student and its synced data. Owner only. */
export function canRemoveStudent(access: StudentAccess): boolean {
  return access === 'owner';
}

/** Connect / disconnect a portal, edit credentials. Owner and admin. */
export function canManageSources(access: StudentAccess): boolean {
  return access === 'owner' || access === 'admin';
}

/** Invite, resend links, remove people, change labels and alert prefs. Owner and admin. */
export function canManagePeople(access: StudentAccess): boolean {
  return access === 'owner' || access === 'admin';
}

/** Is this row the signed-in viewer (by user id once accepted, by email while pending)? */
export function isViewerRow(person: ISharingPerson, viewer: ISessionUser | null): boolean {
  if (viewer === null) return false;
  if (person.userId !== undefined && person.userId === viewer.userId) return true;
  return (
    person.email !== undefined && person.email.toLowerCase() === viewer.email.toLowerCase()
  );
}

/** Promote / demote: owner and admin, on accepted adults other than the owner and themself. */
export function canChangeAdmin(
  access: StudentAccess,
  person: ISharingPerson,
  viewer: ISessionUser | null
): boolean {
  return (
    canManagePeople(access) &&
    !person.isOwner &&
    person.status === 'accepted' &&
    !isViewerRow(person, viewer)
  );
}

/** Remove someone else (pending, accepted or declined). The viewer's own row uses Leave. */
export function canRemovePerson(
  access: StudentAccess,
  person: ISharingPerson,
  viewer: ISessionUser | null
): boolean {
  return canManagePeople(access) && !person.isOwner && !isViewerRow(person, viewer);
}

/** Re-send the invitation or a sign-in link to someone else. Owner and admin. */
export function canResend(
  access: StudentAccess,
  person: ISharingPerson,
  viewer: ISessionUser | null
): boolean {
  return (
    canManagePeople(access) &&
    !person.isOwner &&
    person.status !== 'declined' &&
    !isViewerRow(person, viewer)
  );
}

/** Leave: an accepted adult on their own row, never the owner (decision Q3). */
export function canLeave(person: ISharingPerson, viewer: ISessionUser | null): boolean {
  return !person.isOwner && person.status === 'accepted' && isViewerRow(person, viewer);
}

/**
 * "My alerts": an accepted adult edits their own row through PUT /contacts/:email. The owner's
 * preferences live elsewhere (ownerAlertPrefs, the student's Alerts tab), so the owner row has
 * no panel here.
 */
export function canEditOwnAlerts(person: ISharingPerson, viewer: ISessionUser | null): boolean {
  return canLeave(person, viewer);
}

/** Owner / Admin / Member chip text for a row. Pending rows show what they will become. */
export function roleChipLabel(person: ISharingPerson): 'Owner' | 'Admin' | 'Member' {
  if (person.isOwner) return 'Owner';
  return person.isAdmin ? 'Admin' : 'Member';
}

export function statusChipLabel(person: ISharingPerson): 'Invited' | 'Accepted' | 'Declined' {
  if (person.status === 'pending') return 'Invited';
  return person.status === 'accepted' ? 'Accepted' : 'Declined';
}

export function textsChipLabel(person: ISharingPerson): string {
  switch (person.smsStatus) {
    case 'opted_in':
      return 'Texts: opted in';
    case 'invited':
      return 'Texts: invited';
    case 'opted_out':
      return 'Texts: opted out';
    default:
      return 'Texts: none';
  }
}

export const LABEL_TEXT = {
  parent: 'Parent',
  guardian: 'Guardian',
  caregiver: 'Caregiver',
} as const;
