import type { ISmsContactOptInInvite } from '@scholaracle/contracts';

export interface ISmsContactOptInInviteRepository {
  /** Issue a new link for a contact; any earlier unused link for that contact stops working. */
  issue(params: {
    studentId: string;
    contactEmail: string;
    inviterName: string;
    phoneE164?: string;
  }): Promise<ISmsContactOptInInvite>;
  /** An unused, unexpired invite for the token, or null. */
  findActiveByToken(token: string): Promise<ISmsContactOptInInvite | null>;
  /** Latest invite issued for a contact (used or not). */
  findLatestForContact(
    studentId: string,
    contactEmail: string
  ): Promise<ISmsContactOptInInvite | null>;
  /** Mark the invite used with the number the contact consented with. */
  markUsed(token: string, consentedPhoneE164: string): Promise<void>;
}
