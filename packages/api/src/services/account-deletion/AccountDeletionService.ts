import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
  StudentRepository,
  UserRepository,
} from '@scholaracle/database';
import { NotFoundError } from '@scholaracle/contracts';

function hashUserId(userId: string): string {
  return createHash('sha256').update(userId, 'utf8').digest('hex');
}

function userIdMatchFilter(userId: string, asObjectId: boolean): Record<string, unknown> {
  if (!asObjectId) {
    return { userId };
  }
  const oid = new ObjectId(userId);
  return { userId: { $in: [userId, oid] } };
}

async function deleteJobsAndRuns(db: Db, userId: string): Promise<void> {
  const filter = userIdMatchFilter(userId, true);
  await db.collection(EXTRA_USER_SCOPED_JOB_FILTER).deleteMany({
    $or: [{ 'data.userId': userId }, { 'data.userId': new ObjectId(userId) }],
  });
  await db
    .collection('slc_runs')
    .deleteMany({ $or: [filter, { actorUserId: { $in: [userId, new ObjectId(userId)] } }] });
}

async function purgeCollectionsForUser(db: Db, userId: string): Promise<void> {
  for (const target of USER_SCOPED_DELETION_TARGETS) {
    if (target.name === 'slc_runs') {
      continue;
    }
    const filter = userIdMatchFilter(userId, target.userIdAsObjectId === true);
    await db.collection(target.name).deleteMany(filter);
  }
  await deleteJobsAndRuns(db, userId);
}

async function purgeCollectionsForStudents(db: Db, studentIds: readonly string[]): Promise<void> {
  if (studentIds.length === 0) {
    return;
  }
  const oidList = studentIds.map((id) => new ObjectId(id));
  const studentFilter = { studentId: { $in: [...studentIds, ...oidList] } };
  for (const name of STUDENT_SCOPED_DELETION_COLLECTIONS) {
    await db.collection(name).deleteMany(studentFilter);
  }
}

export class AccountDeletionService {
  private readonly _db: Db;

  constructor(database: Db) {
    this._db = database;
  }

  async deleteParentAccount(userId: string): Promise<void> {
    const userRepo = new UserRepository(this._db);
    const studentRepo = new StudentRepository(this._db);

    const parent = await userRepo.findById(userId);
    if (!parent) {
      throw new NotFoundError('User not found');
    }

    const ownedStudents = await studentRepo.findOwnedByUserId(userId);
    const studentIds = ownedStudents
      .map((s) => s._id?.toString())
      .filter((id): id is string => id !== undefined);

    const studentLoginUserIds: string[] = [];
    for (const studentId of studentIds) {
      const studentUser = await userRepo.findByStudentId(studentId);
      const loginId = studentUser?._id?.toString();
      if (loginId) {
        studentLoginUserIds.push(loginId);
      }
    }

    await purgeCollectionsForUser(this._db, userId);
    await purgeCollectionsForStudents(this._db, studentIds);

    for (const loginUserId of studentLoginUserIds) {
      await purgeCollectionsForUser(this._db, loginUserId);
    }

    for (const studentId of studentIds) {
      await studentRepo.delete(studentId);
    }

    for (const loginUserId of studentLoginUserIds) {
      await userRepo.delete(loginUserId);
    }

    await userRepo.delete(userId);

    await this._db.collection(ACCOUNT_DELETION_AUDIT_COLLECTION).insertOne({
      userIdHash: hashUserId(userId),
      deletedAt: new Date(),
    });
  }
}
