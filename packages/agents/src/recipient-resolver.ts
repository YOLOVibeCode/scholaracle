import type { Db } from 'mongodb';
import { SCHOLARMANCY_SMS_PURPOSE } from '@scholaracle/contracts';
import { SmsConsentRepository, StudentRepository, UserRepository } from '@scholaracle/database';
import type { IResolvedRecipient } from './service/NotificationService/NotificationService';
import { normalizePhoneE164 } from './sms/normalizePhoneE164';

/**
 * The number as texts are sent to it, when it may be texted: a real number with consent on
 * record that was not withdrawn. Null otherwise.
 *
 * The gate asks the same at send time. It is asked here as well so that an alert leaves
 * nothing waiting, and nothing to fail every day, for a number the gate would refuse.
 */
async function textableNumber(
  consents: SmsConsentRepository,
  phone: string | undefined
): Promise<string | null> {
  const typed = phone?.trim() ?? '';
  const phoneE164 = typed === '' ? null : normalizePhoneE164(typed);
  if (phoneE164 === null) return null;
  const consented = await consents.hasActiveConsent(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
  return consented ? phoneE164 : null;
}

/**
 * Resolve all alert recipients for a student: owner (if opted in) + accepted contacts with
 * receiveAlerts. Returns one IResolvedRecipient per person, honouring that person's own
 * channels (email / sms / push) and alert types (sharing-spec §4.5):
 * - `parentEmail` is set only when the person chose email and has an address;
 * - `parentPhone` is set only when the person chose text and their number may be texted;
 * - `userId` is set for the owner and every accepted adult (they always have one once accepted);
 * - `push` is set when the person chose push, so delivery reaches their own devices;
 * - `alertTypes` is passed through when the person narrowed it (unset or empty = all).
 * A person with `receiveAlerts: false` or no deliverable channel gets nothing.
 */
export async function resolveAllAlertRecipients(
  studentId: string,
  db: Db
): Promise<readonly IResolvedRecipient[]> {
  const studentRepo = new StudentRepository(db);
  const userRepo = new UserRepository(db);
  const consents = new SmsConsentRepository(db);
  const student = await studentRepo.findById(studentId);
  if (!student) return [];

  const owner = await userRepo.findById(student.userId.toString());
  const ownerEmail = owner?.email ?? '';
  const ownerPhone = owner?.phone;

  const studentAlertEmail = student.alertEmail?.trim();
  const resolved = student.getAllAlertRecipients(ownerEmail, ownerPhone);
  const out: IResolvedRecipient[] = [];
  for (const r of resolved) {
    const hasEmail = r.channels.includes('email');
    const hasPush = r.channels.includes('push');
    const phone = r.channels.includes('sms') ? await textableNumber(consents, r.phone) : null;
    // `userId` comes from the Student model (owner and accepted adults alike).
    const userId = r.userId;
    const recipientType: 'parent' | 'student' =
      studentAlertEmail && r.email === studentAlertEmail ? 'student' : 'parent';
    out.push({
      ...(hasEmail && r.email ? { parentEmail: r.email } : {}),
      ...(phone !== null ? { parentPhone: phone } : {}),
      ...(userId ? { userId } : {}),
      ...(hasPush && userId ? { push: true } : {}),
      ...(r.alertTypes && r.alertTypes.length > 0 ? { alertTypes: r.alertTypes } : {}),
      recipientType,
    });
  }
  return out.filter((o) => o.parentEmail ?? o.parentPhone ?? o.push);
}
