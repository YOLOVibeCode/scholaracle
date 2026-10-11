/** Scholarmancy SMS program purpose (toll-free verification). */
export const SCHOLARMANCY_SMS_BRAND = 'Scholarmancy';

export const SCHOLARMANCY_SMS_PURPOSE = 'grade and assignment alerts and sign-in links';

export const SCHOLARMANCY_SMS_HELP_LINE = 'Scholarmancy: grade and assignment alerts for parents.';

export const SCHOLARMANCY_SMS_SUPPORT_EMAIL = 'support@scholarmancy.com';

/** Bumped when opt-in checkbox copy changes. */
export const SMS_OPT_IN_TEXT_VERSION = '2026-10-01';

export const SMS_RELAY_SEND_URL = 'https://api.twilio.noctusoft.com/sms/send';

export const SMS_INBOUND_WEBHOOK_URL = 'https://api.scholarmancy.com/api/webhooks/twilio/sms';

export const SMS_STATUS_WEBHOOK_URL = 'https://api.scholarmancy.com/api/webhooks/twilio/status';

export const TWILIO_OPT_OUT_ERROR_CODE = 21610;

/** Appended to every outbound text that does not already carry STOP language. */
export const SMS_STOP_SUFFIX = 'Reply STOP to opt out.';

/** Public web path where an invited co-parent opts in to texts themselves. */
export const SMS_CONTACT_OPT_IN_PATH = '/sms/optin';

/** Source recorded on consent given on the contact self opt-in page. */
export const SMS_CONTACT_OPT_IN_SOURCE = '/sms/optin';

/** Days an opt-in link stays usable. */
export const SMS_CONTACT_OPT_IN_TTL_DAYS = 30;

/** Shown when someone submits a number without checking the consent box. */
export const SMS_CONSENT_REQUIRED_MESSAGE =
  'Check the box to get texts. A number alone is not consent.';

/** Sent once, right after someone opts in on the web. */
export const SMS_OPT_IN_CONFIRMATION_MESSAGE =
  "Scholarmancy: you're opted in to grade and assignment alerts. Msg freq varies. Msg&data rates may apply. HELP for help, STOP to opt out.";

/** Public opt-in URL for a contact invite token. */
export function buildSmsContactOptInUrl(webOrigin: string, token: string): string {
  return `${webOrigin.replace(/\/+$/, '')}${SMS_CONTACT_OPT_IN_PATH}/${token}`;
}

/** Builds the standard web opt-in checkbox label (markdown links for UI). */
export function buildSmsOptInLabelHtml(): string {
  return (
    `Text me ${SCHOLARMANCY_SMS_PURPOSE} from ${SCHOLARMANCY_SMS_BRAND}. ` +
    'Message frequency varies. Message and data rates may apply. ' +
    'Reply STOP to opt out, HELP for help. Consent is not a condition of purchase. ' +
    'See our SMS Terms and Privacy Policy.'
  );
}

export interface ISmsConsentRecord {
  readonly phoneE164: string;
  readonly purpose: string;
  readonly consentTextVersion: string;
  readonly source: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly consentedAt?: Date;
  readonly revokedAt?: Date;
  readonly confirmationSentAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * A link a parent shares so a co-parent can opt in to texts themselves.
 * Nothing is texted to the co-parent's number until they consent on the page.
 */
export interface ISmsContactOptInInvite {
  readonly token: string;
  readonly studentId: string;
  readonly contactEmail: string;
  readonly inviterName: string;
  /** Number the inviting parent typed, if any; the co-parent must confirm the same number. */
  readonly phoneE164?: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt?: Date;
  /** Number the co-parent consented with. */
  readonly consentedPhoneE164?: string;
}

/** Text status of a contact as shown to the inviting parent. */
export type ContactSmsStatus = 'none' | 'invited' | 'opted_in' | 'opted_out';
