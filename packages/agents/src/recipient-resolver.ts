import type { Db } from 'mongodb';
import { StudentRepository, UserRepository } from '@scholaracle/database';
import type { IResolvedRecipient } from './service/NotificationService/NotificationService';

/**
 * Resolve all alert recipients for a student: owner (if opted in) + accepted contacts with receiveAlerts.
 * Returns one IResolvedRecipient per person; only channels they have (email/phone) are set.
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

  const resolved = student.getAllAlertRecipients(ownerEmail, ownerPhone);
  const out: IResolvedRecipient[] = [];
  for (const r of resolved) {
    const hasEmail = r.channels.includes('email');
    const hasSms = r.channels.includes('sms');
    out.push({
      ...(hasEmail && r.email ? { parentEmail: r.email } : {}),
      ...(hasSms && r.phone ? { parentPhone: r.phone } : {}),
      ...(r.isPrimary ? { userId: student.userId.toString() } : {}),
    });
  }
  return out.filter((o) => o.parentEmail ?? o.parentPhone);
}
