import { createHash } from 'node:crypto';
import type { Db, Document, UpdateFilter } from 'mongodb';
import { ObjectId } from 'mongodb';
import {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_ID_KEYED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
  StudentRepository,
  UserRepository,
} from '@scholaracle/database';
import { NotFoundError } from '@scholaracle/contracts';
import { logger } from '../../logger';
import type { IAssetStore } from '../assets/IAssetStore';

/** Collections whose rows point at a stored file through `storageKey`. */
const FILE_COLLECTIONS = ['slc_assets', 'slc_run_skeletons'] as const;

export interface IFilesNotRemovedReport {
  readonly failed: number;
  readonly total: number;
}

export interface IAccountDeletionOptions {
  /**
   * Where synced materials and page skeletons are stored. Without it the rows are deleted
   * and the files are left where they are.
   */
  readonly assetStore?: Pick<IAssetStore, 'delete'>;
  /** Told when files could not be removed. Default: an error line in the log, counts only. */
  readonly onFilesNotRemoved?: (report: IFilesNotRemovedReport) => void;
}

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
  for (const name of USER_ID_KEYED_DELETION_COLLECTIONS) {
    await db.collection<{ _id: string }>(name).deleteMany({ _id: userId });
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
  // Reminder and weekly-review jobs name the student, not the parent.
  await db
    .collection(EXTRA_USER_SCOPED_JOB_FILTER)
    .deleteMany({ 'data.studentId': { $in: [...studentIds, ...oidList] } });
}

function storageKeysIn(rows: readonly Record<string, unknown>[]): string[] {
  return rows
    .map((row) => row['storageKey'])
    .filter((key): key is string => typeof key === 'string' && key !== '');
}

/**
 * The files only these users' rows point at. A file that another household's row also
 * names stays: the demo households share their files, and it is not ours to remove.
 */
async function storageKeysOf(db: Db, userIds: readonly string[]): Promise<readonly string[]> {
  const leaving = userIds.flatMap((id) => [id, new ObjectId(id)]);
  const keys = new Set<string>();
  for (const name of FILE_COLLECTIONS) {
    const rows = await db
      .collection(name)
      .find({ userId: { $in: leaving } }, { projection: { storageKey: 1 } })
      .toArray();
    storageKeysIn(rows).forEach((key) => keys.add(key));
  }
  for (const name of FILE_COLLECTIONS) {
    const shared = await db
      .collection(name)
      .find(
        { storageKey: { $in: [...keys] }, userId: { $nin: leaving } },
        { projection: { storageKey: 1 } }
      )
      .toArray();
    storageKeysIn(shared).forEach((key) => keys.delete(key));
  }
  return [...keys];
}

/** Removes each file; one that fails is counted and the rest still go. */
async function removeFiles(
  store: Pick<IAssetStore, 'delete'>,
  keys: readonly string[]
): Promise<IFilesNotRemovedReport> {
  let failed = 0;
  for (const key of keys) {
    try {
      await store.delete(key);
    } catch {
      failed += 1;
    }
  }
  return { failed, total: keys.length };
}

function logFilesNotRemoved(report: IFilesNotRemovedReport): void {
  logger.error(
    { failed: report.failed, total: report.total },
    'Account deletion: stored files could not be removed and are now orphaned'
  );
}

/**
 * A deleted co-parent must not stay listed (with their email) on students that
 * another parent owns. Those students survive; only the share entry goes.
 */
async function removeFromOtherFamiliesShares(
  db: Db,
  userId: string,
  email: string | undefined
): Promise<void> {
  const match: Record<string, unknown>[] = [{ userId }];
  if (email) match.push({ email: email.toLowerCase() }, { email });
  await db.collection('students').updateMany(
    { sharedWith: { $elemMatch: { $or: match } } },
    // The driver's PullOperator typing does not accept $or inside an array element filter.
    { $pull: { sharedWith: { $or: match } } } as unknown as UpdateFilter<Document>
  );
}

export class AccountDeletionService {
  private readonly _db: Db;
  private readonly _options: IAccountDeletionOptions;

  constructor(database: Db, options: IAccountDeletionOptions = {}) {
    this._db = database;
    this._options = options;
  }

  /**
   * Files go first, while the rows that name them still exist. The person asked to be
   * deleted, so a file that cannot be removed is reported and never stops the deletion.
   */
  private async _removeStoredFiles(userIds: readonly string[]): Promise<void> {
    const store = this._options.assetStore;
    if (!store) {
      return;
    }
    const report = await removeFiles(store, await storageKeysOf(this._db, userIds));
    if (report.failed > 0) {
      (this._options.onFilesNotRemoved ?? logFilesNotRemoved)(report);
    }
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

    await this._removeStoredFiles([userId, ...studentLoginUserIds]);

    await purgeCollectionsForUser(this._db, userId);
    await purgeCollectionsForStudents(this._db, studentIds);
    await removeFromOtherFamiliesShares(this._db, userId, parent.email);

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
