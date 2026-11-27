import type { Request } from 'express';
import { SCHOLARMANCY_SMS_PURPOSE } from '@scholaracle/contracts';
import { normalizePhoneE164 } from '@scholaracle/agents';
import type { SmsConsentRepository } from '@scholaracle/database';
import { recordSmsOptInFromRequest } from './recordSmsOptIn';

/** A person's own mobile number and whether the opt-in box of their account is ticked. */
export interface IAccountSmsConsent {
  /** E.164, or undefined when the account has no number. */
  readonly phone: string | undefined;
  readonly consent: boolean;
}

/** What a Settings save says about the number and the box. Either can be left out. */
export interface ISmsConsentSave {
  /** The number in the save, normalized; undefined when it was removed. Read only with `phoneSent`. */
  readonly phone: string | undefined;
  readonly phoneSent: boolean;
  /** The box as sent; undefined when the save does not mention it. */
  readonly consent: boolean | undefined;
}

/**
 * The account as it is stored. Most accounts have no number; a stored value that cannot be
 * read as a number counts as none.
 */
export function storedAccountSmsConsent(account: {
  readonly phone?: string | null;
  readonly smsConsent?: boolean;
}): IAccountSmsConsent {
  const stored = account.phone?.trim() ?? '';
  const phone = stored === '' ? undefined : (normalizePhoneE164(stored) ?? undefined);
  return { phone, consent: account.smsConsent === true };
}

/**
 * The account after a save. A consent is for one number: when the number changes and the save
 * does not say the box is ticked, the consent does not move to the new number.
 */
export function accountSmsConsentAfterSave(
  before: IAccountSmsConsent,
  save: ISmsConsentSave
): IAccountSmsConsent {
  const phone = save.phoneSent ? save.phone : before.phone;
  const carried = before.consent && phone === before.phone;
  return { phone, consent: save.consent ?? carried };
}

/** Whether the box is ticked for the same number before and after: the save only repeats it. */
function repeatsConsent(before: IAccountSmsConsent, after: IAccountSmsConsent): boolean {
  return before.consent && after.consent && before.phone === after.phone;
}

/**
 * The number whose consent a save withdraws: the box was unticked, or the number it was ticked
 * for was changed or removed. A box that was not ticked withdraws nothing, so a consent the
 * person gave elsewhere for that number (the link a parent shares) stands.
 */
export function smsConsentWithdrawnBySave(
  before: IAccountSmsConsent,
  after: IAccountSmsConsent
): string | undefined {
  if (!before.consent || before.phone === undefined) return undefined;
  return repeatsConsent(before, after) ? undefined : before.phone;
}

/**
 * Puts the consent a save gives on record: the box is ticked now, for a number it was not
 * ticked for before.
 *
 * A save that only repeats a ticked box records nothing. The record keeps the day the consent
 * was given, and a STOP reply stands until the person texts START or unticks the box and ticks
 * it again. The one exception is an account whose consent or refusal was never put on record.
 */
export async function recordSmsConsentGivenBySave(
  consentRepo: SmsConsentRepository,
  req: Request,
  change: { readonly before: IAccountSmsConsent; readonly after: IAccountSmsConsent },
  source: string
): Promise<void> {
  const { before, after } = change;
  if (!after.consent || after.phone === undefined) return;
  if (repeatsConsent(before, after)) {
    const record = await consentRepo.findByPhoneAndPurpose(after.phone, SCHOLARMANCY_SMS_PURPOSE);
    const answered = record?.consentedAt !== undefined || record?.revokedAt !== undefined;
    if (answered) return;
  }
  await recordSmsOptInFromRequest(consentRepo, req, after.phone, source);
}
