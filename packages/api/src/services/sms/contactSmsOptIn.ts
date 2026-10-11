import type { Db } from 'mongodb';
import {
  SCHOLARMANCY_SMS_PURPOSE,
  buildSmsContactOptInUrl,
  type ContactSmsStatus,
} from '@scholaracle/contracts';
import { normalizePhoneE164 } from '@scholaracle/agents';
import { SmsConsentRepository, SmsContactOptInInviteRepository } from '@scholaracle/database';

export interface IContactForSmsStatus {
  readonly email?: string;
  readonly phone?: string;
  readonly alertChannels?: readonly ('email' | 'sms')[];
}

export interface IIssueContactOptInParams {
  readonly studentId: string;
  readonly contactEmail: string;
  readonly inviterName: string;
  readonly phone?: string;
  readonly alertChannels?: readonly ('email' | 'sms')[];
}

export interface IContactSmsOptIn {
  /** Opt-in link for the parent to share when the contact gets texts; nothing is texted. */
  issueIfTexting(params: IIssueContactOptInParams): Promise<string | undefined>;
  statusFor(studentId: string, contact: IContactForSmsStatus): Promise<ContactSmsStatus>;
}

/**
 * Co-parents opt in to texts themselves from a link the inviting parent shares.
 * A number one parent types in for another is never texted before that person consents.
 */
export function createContactSmsOptIn(database: Db, webOrigin: string): IContactSmsOptIn {
  const invites = new SmsContactOptInInviteRepository(database);
  const consents = new SmsConsentRepository(database);

  async function consentStatus(phoneE164: string): Promise<ContactSmsStatus | undefined> {
    const record = await consents.findByPhoneAndPurpose(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
    if (record?.revokedAt) return 'opted_out';
    if (record?.consentedAt) return 'opted_in';
    return undefined;
  }

  return {
    async issueIfTexting(params: IIssueContactOptInParams): Promise<string | undefined> {
      if (!params.alertChannels?.includes('sms')) return undefined;
      const phoneE164 = params.phone?.trim()
        ? (normalizePhoneE164(params.phone) ?? undefined)
        : undefined;
      const invite = await invites.issue({
        studentId: params.studentId,
        contactEmail: params.contactEmail,
        inviterName: params.inviterName,
        ...(phoneE164 ? { phoneE164 } : {}),
      });
      return buildSmsContactOptInUrl(webOrigin, invite.token);
    },

    async statusFor(studentId: string, contact: IContactForSmsStatus): Promise<ContactSmsStatus> {
      if (!contact.alertChannels?.includes('sms') || !contact.email) return 'none';
      const latest = await invites.findLatestForContact(studentId, contact.email);
      const phone = contact.phone?.trim() ? normalizePhoneE164(contact.phone) : null;
      const candidate = phone ?? latest?.consentedPhoneE164 ?? null;
      const fromConsent = candidate ? await consentStatus(candidate) : undefined;
      if (fromConsent) return fromConsent;
      const isActive = latest && !latest.usedAt && latest.expiresAt.getTime() > Date.now();
      return isActive ? 'invited' : 'none';
    },
  };
}
