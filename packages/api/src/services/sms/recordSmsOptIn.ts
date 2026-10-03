import type { Request } from 'express';
import { SMS_OPT_IN_TEXT_VERSION, SCHOLARMANCY_SMS_PURPOSE } from '@scholaracle/contracts';
import { normalizePhoneE164 } from '@scholaracle/agents';
import type { SmsConsentRepository } from '@scholaracle/database';

/** Persists checkbox opt-in when user supplied phone + explicit consent. */
export async function recordSmsOptInFromRequest(
  consentRepo: SmsConsentRepository,
  req: Request,
  phone: string,
  source: string
): Promise<string> {
  const phoneE164 = normalizePhoneE164(phone);
  if (!phoneE164) {
    throw new Error('Invalid phone number');
  }
  await consentRepo.recordOptIn({
    phoneE164,
    purpose: SCHOLARMANCY_SMS_PURPOSE,
    consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
    source,
    ipAddress: req.ip ?? undefined,
    userAgent: req.headers['user-agent'] ?? undefined,
  });
  return phoneE164;
}
