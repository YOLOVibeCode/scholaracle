/**
 * Wire contracts for sharing a student with other adults (docs/sharing-spec.md §4.3).
 *
 * Server is source of truth: packages/api/src/routes/sharing/sharing.ts and the
 * per-student `/api/students/:id/contacts*` routes in routes/students/students.ts.
 * Identity for every sharing call is the JWT email; request bodies never choose
 * whose invitation is listed, accepted or declined.
 */

import type { ContactSmsStatus } from '../smsCompliance';

/** What the caller may do with a student. Labels (parent/guardian/caregiver) never grant rights. */
export type StudentAccess = 'owner' | 'admin' | 'member';

/** Display label for a shared adult. Permissions never derive from it. */
export type SharingLabel = 'parent' | 'guardian' | 'caregiver';

/** Alert delivery channels an adult may pick for a student. `push` goes to that adult's own devices. */
export type SharingAlertChannel = 'email' | 'sms' | 'push';

export type SharingInviteStatus = 'pending' | 'accepted' | 'declined';

/**
 * One person on a student's "Family & guardians" list (owner included), as returned by
 * `GET /api/students/:id/contacts` and its `/parents` alias.
 */
export interface ISharingPerson {
  /** Set for the owner and for accepted adults; absent while an invitation is pending. */
  readonly userId?: string;
  /** The invited address; for the owner row, the owner's account email. */
  readonly email?: string;
  /** For the owner row, the owner's account name. */
  readonly name?: string;
  readonly role: SharingLabel;
  readonly status: SharingInviteStatus;
  readonly isOwner: boolean;
  readonly isAdmin: boolean;
  readonly invitedAt?: string;
  readonly acceptedAt?: string;
  readonly phone?: string;
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly SharingAlertChannel[];
  readonly alertTypes?: readonly string[];
  /** This adult gets a copy of the student's Sunday weekly review (spec §3.3 Q2; default off). */
  readonly weeklyReviewCopy?: boolean;
  /** Texting consent state for this person on this student (none / invited / opted_in / opted_out). */
  readonly smsStatus?: ContactSmsStatus;
  /** Groups the entries created by one invitation across several students. */
  readonly inviteGroupId?: string;
  /** The owner or admin who sent the invitation. */
  readonly invitedByUserId?: string;
}

/** A pending invitation addressed to the caller, as listed by `GET /api/sharing/invites/pending`. */
export interface ISharingPendingInvite {
  readonly studentId: string;
  readonly studentName: string;
  /** User id of the person who invited (falls back to the owner for older entries). */
  readonly invitedBy: string;
  readonly invitedByName?: string;
  readonly inviteGroupId?: string;
  readonly invite: {
    readonly email: string;
    readonly role: SharingLabel;
    readonly status: 'pending';
    readonly invitedAt: string;
    readonly isAdmin: boolean;
  };
}

/** Request body of `POST /api/sharing/invites`: one person, one or more students, one email. */
export interface ISharingInviteRequest {
  readonly email: string;
  readonly name?: string;
  readonly phone?: string;
  readonly label: SharingLabel;
  readonly isAdmin?: boolean;
  readonly studentIds: readonly string[];
  readonly alertChannels?: readonly SharingAlertChannel[];
}

/**
 * Outcome for one student of an invitation.
 * - `invited`: a pending entry was created (or a declined one re-opened).
 * - `already_invited` / `already_accepted`: skipped, not an error.
 * - `no_access`: the caller may not administer that student. The server currently refuses the
 *   whole request (403) instead of partially inviting, so clients should handle both forms.
 */
export type SharingInvitePerStudentStatus =
  'invited' | 'already_invited' | 'already_accepted' | 'no_access';

/** Response of `POST /api/sharing/invites` and `POST /api/students/:id/contacts`. */
export interface ISharingInviteResult {
  readonly inviteGroupId: string;
  readonly perStudent: readonly {
    readonly studentId: string;
    readonly status: SharingInvitePerStudentStatus;
  }[];
  /**
   * Present when a phone was given and texting requested: the consent link the inviter passes on.
   * Nothing is texted to the number before the person opts in themselves.
   */
  readonly smsOptInUrl?: string;
}

/** The caller's own alert settings for one student. */
export interface ISharingMyAlerts {
  readonly receiveAlerts: boolean;
  readonly alertChannels: readonly SharingAlertChannel[];
  readonly alertTypes?: readonly string[];
  /** Copy of the student's weekly review to the caller (spec §3.3 Q2). The server always sets it; off unless true. */
  readonly weeklyReviewCopy?: boolean;
}

/** One accessible student from the caller's point of view (`GET /api/sharing/mine`). */
export interface IMySharingStudent {
  readonly studentId: string;
  readonly name: string;
  readonly access: StudentAccess;
  /** Who shared the student with the caller; absent for students the caller owns. */
  readonly invitedBy?: {
    readonly userId: string;
    readonly name?: string;
  };
  readonly alerts: ISharingMyAlerts;
}

export interface IMySharingView {
  readonly students: readonly IMySharingStudent[];
}

/** Request body of `POST /api/sharing/invites/accept` and `/decline`. */
export type ISharingInviteSelection =
  { readonly inviteGroupId: string } | { readonly studentIds: readonly string[] };

/** Response of accept / decline: which students were affected. */
export interface ISharingInviteSelectionResult {
  readonly success: boolean;
  readonly studentIds: readonly string[];
}

/** Request body of `POST /api/sharing/leave`. */
export interface ISharingLeaveRequest {
  readonly studentId: string;
}

/** Response of `POST /api/sharing/leave`. */
export interface ISharingLeaveResult {
  readonly success: boolean;
}

/** Response of `POST /api/sharing/invites/:groupId/resend`. */
export interface ISharingResendResult {
  readonly success: boolean;
  readonly studentIds: readonly string[];
  readonly expiresAt: string;
}

/**
 * Request body of `PUT /api/students/:id/contacts/:email`. An owner or admin may send any field;
 * the person themself only `receiveAlerts`, `alertChannels` and `alertTypes` (the server rejects
 * anyone else). The route is a patch: an absent field is left unchanged.
 */
export interface ISharingContactUpdateRequest {
  readonly name?: string;
  readonly phone?: string;
  readonly role?: SharingLabel;
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly SharingAlertChannel[];
  /** An array = exactly these types; `null` = every type (clears a narrowed list); absent = unchanged. */
  readonly alertTypes?: readonly string[] | null;
  /** Copy of the student's Sunday weekly review to this adult (student review §3.3 Q2). */
  readonly weeklyReviewCopy?: boolean;
}

/** Response of `PUT /api/students/:id/contacts/:email`. */
export interface ISharingContactUpdateResult {
  readonly success: boolean;
  /** Present when the update turned texting on for a phone that has not opted in yet. */
  readonly smsOptInUrl?: string;
}

/** Request body of `PUT /api/students/:id/contacts/:email/admin`. */
export interface ISharingContactAdminRequest {
  readonly isAdmin: boolean;
}

/** Request body of `POST /api/students/:id/contacts/:email/magic-link/send`. */
export interface ISharingLoginLinkRequest {
  readonly channel: 'email' | 'sms';
  /** Overrides the contact's stored email / phone. */
  readonly to?: string;
}

/** Response of `POST /api/students/:id/contacts/:email/magic-link/send`. */
export interface ISharingLoginLinkResult {
  readonly success: boolean;
  readonly expiresAt: string;
}

/** Request body of `PUT /api/students/:id/owner-alert-prefs` (owner only). */
export interface ISharingOwnerAlertPrefsRequest {
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly SharingAlertChannel[];
  /** An array = exactly these types; `null` or absent = every type. */
  readonly alertTypes?: readonly string[] | null;
  /** Whole-object replace: absent means off (student review §3.3 Q2). */
  readonly weeklyReviewCopy?: boolean;
}

/** Response of `PUT /api/students/:id/owner-alert-prefs`. */
export interface ISharingOwnerAlertPrefsResult {
  readonly success: boolean;
  readonly ownerAlertPrefs: ISharingMyAlerts;
}

/** `{ success }` envelope of the contact admin and removal routes. */
export interface ISharingSuccessResult {
  readonly success: boolean;
}
