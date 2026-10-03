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
