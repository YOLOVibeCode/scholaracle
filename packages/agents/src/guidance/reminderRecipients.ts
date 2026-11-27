import { ObjectId, type Db } from 'mongodb';
import {
  StudentRepository,
  UserRepository,
  effectiveOwnerAlertPrefs,
  type Student,
  type User,
} from '@scholaracle/database';
import { hasPushDevice } from '../push/hasPushDevice';
import type { IReminderRecipient, ReminderRecipientResolver } from './ReminderNotificationSink';

function recipient(email: string | undefined, pushUserId: string | undefined): IReminderRecipient {
  const address = email?.trim() ?? '';
  return {
    ...(address !== '' && { email: address }),
    ...(pushUserId !== undefined && pushUserId !== '' && { pushUserId }),
  };
}

async function findUser(users: UserRepository, id: string): Promise<User | null> {
  return ObjectId.isValid(id) ? users.findById(id) : null;
}

/**
 * The student's own sign-in: the account the parent set up for them and has not taken
 * away since. Reminders for a student go there and nowhere else, never to a parent.
 */
async function studentRecipient(
  users: UserRepository,
  student: Student
): Promise<IReminderRecipient> {
  const loginId = student.studentLogin?.userId ?? '';
  const login = await findUser(users, loginId);
  if (login === null || login.role !== 'student' || login.isSuspended) return {};
  return recipient(login.email, hasPushDevice(login) ? loginId : undefined);
}

/**
 * The account owner. The email goes to them as it always has; a push goes to their own
 * phone only when they chose push for this student and have not turned its alerts off.
 */
async function parentRecipient(
  users: UserRepository,
  student: Student
): Promise<IReminderRecipient> {
  const ownerId = student.userId.toString();
  const owner = await findUser(users, ownerId);
  if (owner === null) return {};
  const prefs = effectiveOwnerAlertPrefs(student.ownerAlertPrefs);
  const wantsPush = prefs.receiveAlerts && prefs.alertChannels.includes('push');
  return recipient(owner.email, wantsPush && hasPushDevice(owner) ? ownerId : undefined);
}

/**
 * Who a ladder reminder or a nudge reaches, read from the database at send time.
 * An unknown student, or an id that is not an id, reaches nobody.
 */
export function createReminderRecipientResolver(database: Db): ReminderRecipientResolver {
  const users = new UserRepository(database);
  const students = new StudentRepository(database);
  return async (audience, studentId): Promise<IReminderRecipient> => {
    if (!ObjectId.isValid(studentId)) return {};
    const student = await students.findById(studentId);
    if (student === null) return {};
    return audience === 'student'
      ? studentRecipient(users, student)
      : parentRecipient(users, student);
  };
}
