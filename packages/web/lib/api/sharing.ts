import type {
  IMySharingView,
  ISharingInviteRequest,
  ISharingInviteResult,
  ISharingInviteSelection,
  ISharingInviteSelectionResult,
  ISharingPendingInvite,
  ISharingPerson,
  SharingAlertChannel,
  SharingLabel,
} from '@scholaracle/contracts';
import { apiClient } from './client';

/** Fields a person may change on a Family & guardians row (PUT /students/:id/contacts/:email). */
export interface ISharingPersonPatch {
  readonly name?: string;
  readonly phone?: string;
  readonly role?: SharingLabel;
  readonly receiveAlerts?: boolean;
  readonly alertChannels?: readonly SharingAlertChannel[];
  readonly alertTypes?: readonly string[];
}

export interface ISharingResendResult {
  readonly success: boolean;
  readonly studentIds: readonly string[];
  readonly expiresAt: string;
}

/**
 * Sharing a student with other adults (docs/sharing-spec.md §4.3).
 * Cross-student calls live under /sharing; per-student management under /students/:id/contacts.
 * The signed-in user's email is always taken from the JWT by the server.
 */
export const sharingApi = {
  /** One person, one or more students, one email. */
  async invite(body: ISharingInviteRequest): Promise<ISharingInviteResult> {
    return apiClient.post<ISharingInviteResult>('/sharing/invites', body);
  },

  /** Pending invitations addressed to the signed-in user. */
  async getPendingInvites(): Promise<readonly ISharingPendingInvite[]> {
    return apiClient.get<readonly ISharingPendingInvite[]>('/sharing/invites/pending');
  },

  async accept(selection: ISharingInviteSelection): Promise<ISharingInviteSelectionResult> {
    return apiClient.post<ISharingInviteSelectionResult>('/sharing/invites/accept', selection);
  },

  async decline(selection: ISharingInviteSelection): Promise<ISharingInviteSelectionResult> {
    return apiClient.post<ISharingInviteSelectionResult>('/sharing/invites/decline', selection);
  },

  /** Re-send the one email of an invitation group (owner or admin on every student). */
  async resend(inviteGroupId: string): Promise<ISharingResendResult> {
    return apiClient.post<ISharingResendResult>(
      `/sharing/invites/${encodeURIComponent(inviteGroupId)}/resend`
    );
  },

  /** The signed-in adult stops following a student (never the owner). */
  async leave(studentId: string): Promise<boolean> {
    const res = await apiClient.post<{ success?: boolean }>('/sharing/leave', { studentId });
    return res.success ?? false;
  },

  /** Every accessible student with the caller's access, inviter and own alert prefs. */
  async mine(): Promise<IMySharingView> {
    return apiClient.get<IMySharingView>('/sharing/mine');
  },

  /** Owner plus every invited adult for one student, with status and texting consent. */
  async listPeople(studentId: string): Promise<readonly ISharingPerson[]> {
    return apiClient.get<readonly ISharingPerson[]>(`/students/${studentId}/contacts`);
  },

  /** Owner/admin: any field. The person themself: only their alert preferences. */
  async updatePerson(
    studentId: string,
    email: string,
    patch: ISharingPersonPatch
  ): Promise<{ success: boolean; smsOptInUrl?: string }> {
    return apiClient.put<{ success: boolean; smsOptInUrl?: string }>(
      `/students/${studentId}/contacts/${encodeURIComponent(email)}`,
      patch
    );
  },

  async setAdmin(studentId: string, email: string, isAdmin: boolean): Promise<boolean> {
    const res = await apiClient.put<{ success?: boolean }>(
      `/students/${studentId}/contacts/${encodeURIComponent(email)}/admin`,
      { isAdmin }
    );
    return res.success ?? false;
  },

  /** Owner or admin removes a person (pending or accepted). */
  async removePerson(studentId: string, email: string): Promise<boolean> {
    const res = await apiClient.delete<{ success?: boolean }>(
      `/students/${studentId}/contacts/${encodeURIComponent(email)}`
    );
    return res.success ?? false;
  },

  /** 24 h one-time sign-in link for a person on this student (owner or admin). */
  async sendLoginLink(
    studentId: string,
    email: string,
    channel: 'email' | 'sms' = 'email'
  ): Promise<{ success: boolean; expiresAt?: string }> {
    return apiClient.post<{ success: boolean; expiresAt?: string }>(
      `/students/${studentId}/contacts/${encodeURIComponent(email)}/magic-link/send`,
      { channel }
    );
  },
};
