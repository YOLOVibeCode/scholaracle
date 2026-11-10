import type { Db } from 'mongodb';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import type { IResolvedRecipient } from './service/NotificationService/NotificationService';

/**
 * Resolve all alert recipients for a student: owner (if opted in) + accepted contacts with
 * receiveAlerts. Returns one IResolvedRecipient per person, honouring that person's own
 * channels (email / sms / push) and alert types (sharing-spec §4.5):
 * - `parentEmail` / `parentPhone` are set only for channels the person chose and has;
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
    const hasSms = r.channels.includes('sms');
    const hasPush = r.channels.includes('push');
    // `userId` comes from the Student model (owner and accepted adults alike).
    const userId = r.userId;
    const recipientType: 'parent' | 'student' =
      studentAlertEmail && r.email === studentAlertEmail ? 'student' : 'parent';
    out.push({
      ...(hasEmail && r.email ? { parentEmail: r.email } : {}),
      ...(hasSms && r.phone ? { parentPhone: r.phone } : {}),
      ...(userId ? { userId } : {}),
      ...(hasPush && userId ? { push: true } : {}),
      ...(r.alertTypes && r.alertTypes.length > 0 ? { alertTypes: r.alertTypes } : {}),
      recipientType,
    });
  }
  return out.filter((o) => o.parentEmail ?? o.parentPhone ?? o.push);
}
