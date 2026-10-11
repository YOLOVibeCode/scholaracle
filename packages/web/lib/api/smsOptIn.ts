import { apiClient } from './client';

export interface ISmsOptInInviteView {
  readonly inviterName: string;
  /** Last four digits of the number the inviting parent added, if any. */
  readonly numberEnding?: string;
  readonly consentText: string;
  readonly consentTextVersion: string;
  readonly expiresAt: string;
}

/** Public co-parent opt-in (no session). */
export const smsOptInApi = {
  async get(token: string): Promise<ISmsOptInInviteView> {
    return apiClient.get<ISmsOptInInviteView>(`/sms/optin/${encodeURIComponent(token)}`);
  },

  async submit(token: string, phone: string, consent: boolean): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(`/sms/optin/${encodeURIComponent(token)}`, {
      phone,
      consent,
    });
  },
};
