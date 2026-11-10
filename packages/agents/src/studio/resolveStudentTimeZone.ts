import { ObjectId, type Collection, type Db, type Document } from 'mongodb';
import type { Student } from '@scholaracle/database';
import { isValidTimeZone } from '@scholaracle/studio-core';

/** The zone the product assumed before anyone could store one (settings.ts, User model). */
export const DEFAULT_STUDENT_TIME_ZONE = 'America/New_York';

/**
 * The IANA zone a student's days are bucketed in, for `GET /api/studio/week` and the
 * weekly-review worker alike (one answer, so the push says what the screen shows):
 * the student login's stored `users.timezone`, else the owner's stored `users.timezone`,
 * else America/New_York. Raw documents, not the User model: the model fills the default
 * in, and a default is not "stored". Unknown or junk zones are skipped, never thrown.
 */
export async function resolveStudentTimeZone(
  database: Db,
  student: Pick<Student, '_id' | 'userId'>
): Promise<string> {
  const users = database.collection('users');
  const studentId = student._id?.toString() ?? '';
  if (studentId !== '') {
    const fromStudent = await storedTimeZone(users, { studentId });
    if (fromStudent !== undefined) return fromStudent;
  }
  const ownerId = student.userId.toString();
  if (ObjectId.isValid(ownerId)) {
    const fromOwner = await storedTimeZone(users, { _id: new ObjectId(ownerId) });
    if (fromOwner !== undefined) return fromOwner;
  }
  return DEFAULT_STUDENT_TIME_ZONE;
}

async function storedTimeZone(
  users: Collection<Document>,
  filter: Record<string, unknown>
): Promise<string | undefined> {
  const doc = await users.findOne(filter, { projection: { timezone: 1 } });
  const zone = doc?.['timezone'];
  return typeof zone === 'string' && zone !== '' && isValidTimeZone(zone) ? zone : undefined;
}
