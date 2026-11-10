/**
 * Permission matrix for a student's adults (docs/sharing-spec.md §4.2). Pure: the screens ask
 * these before showing a control; the server enforces the same rules, so a hidden control is a
 * courtesy, never the only guard. Labels (parent / guardian / caregiver) grant nothing.
 */

import type { ISharingPerson, IStudentListItem, StudentAccess } from '@scholaracle/contracts';

/** Owner or admin: may change the student, its portals and its people. */
export function isAdminAccess(access: StudentAccess | null | undefined): boolean {
  return access === 'owner' || access === 'admin';
}

/** Edit name, grade, student id. */
export function canEditStudent(access: StudentAccess | null | undefined): boolean {
  return isAdminAccess(access);
}

/** Remove the student and its synced data: the owner alone. */
export function canRemoveStudent(access: StudentAccess | null | undefined): boolean {
  return access === 'owner';
}

/** Connect / disconnect a portal on the account, edit credentials. */
export function canManagePortals(access: StudentAccess | null | undefined): boolean {
  return isAdminAccess(access);
}

/** Invite, resend, remove people, change their label or alert prefs, promote / demote. */
export function canManagePeople(access: StudentAccess | null | undefined): boolean {
  return isAdminAccess(access);
}

/** Share the student with someone new. */
export function canInvite(access: StudentAccess | null | undefined): boolean {
  return isAdminAccess(access);
}

/** Stop following a student oneself: every adult but the owner. */
export function canLeave(access: StudentAccess | null | undefined): boolean {
  return access === 'admin' || access === 'member';
}

/**
 * Server-side disconnect ("remove from account") needs portal rights. Unknown access (the
 * student list could not be loaded) keeps the option: the server still decides.
 */
export function canDisconnectOnServerAs(access: StudentAccess | null | undefined): boolean {
  return access === undefined || access === null || isAdminAccess(access);
}

export function accessLabel(access: StudentAccess): 'Owner' | 'Admin' | 'Member' {
  if (access === 'owner') return 'Owner';
  return access === 'admin' ? 'Admin' : 'Member';
}

/** The access a person on the Family & guardians list holds. */
export function accessOf(person: Pick<ISharingPerson, 'isOwner' | 'isAdmin'>): StudentAccess {
  if (person.isOwner) return 'owner';
  return person.isAdmin ? 'admin' : 'member';
}

/** `student id -> access` from the GET /api/students response. */
export function accessMapFromStudents(
  rows: readonly Pick<IStudentListItem, 'id' | 'access'>[]
): ReadonlyMap<string, StudentAccess> {
  return new Map(rows.map((row) => [row.id, row.access] as const));
}

/** Shown instead of the Connect button when a member has no portal for a student. */
export function connectPortalBlockedMessage(studentName: string): string {
  return `${studentName} has no portal connected on this phone. Only the owner or an admin can connect one; ask them, or sync from a phone that has the portal.`;
}
