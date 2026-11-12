import { ObjectId, type Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import {
  BulkUpdater,
  runOneTimeMigration,
  type ILog,
  type OneTimeMigrationResult,
} from './oneTimeMigrationMarker';

const MARKER_ID = 'alert-student-id';

export type AlertStudentIdOnBootResult = OneTimeMigrationResult;

export interface IAlertStudentIdStats {
  /** Alert rows whose `studentId` is not a Mongo id. */
  readonly scanned: number;
  /** Rows rewritten (or, in dry-run, that would be) to their student's Mongo id. */
  readonly rewritten: number;
  /** Rows whose portal id matches two or more of the owner's students; left as they are. */
  readonly ambiguous: number;
  /** Rows whose portal id matches none of the owner's students; left as they are. */
  readonly unresolved: number;
}

interface ILegacyAlertRow {
  readonly _id: unknown;
  readonly userId?: unknown;
  readonly studentId?: unknown;
}

/** Candidate keys a student may be referred to by on a legacy alert row. */
function portalKeys(studentId: string | undefined): readonly string[] {
  const raw = studentId?.trim();
  if (!raw) return [];
  const parts = raw.split(':', 2);
  return parts.length === 2 && parts[1] ? [raw, parts[1]] : [raw];
}

/** For one owner: each portal key -> the Mongo ids of the owner's students it could mean. */
async function keyIndexFor(db: Db, ownerUserId: string): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>();
  if (!ObjectId.isValid(ownerUserId)) return index;
  const students = await new StudentRepository(db).findOwnedByUserId(ownerUserId);
  for (const student of students) {
    const mongoId = student._id?.toString();
    if (!mongoId) continue;
    for (const key of portalKeys(student.studentId)) {
      const ids = index.get(key) ?? new Set<string>();
      ids.add(mongoId);
      index.set(key, ids);
    }
  }
  return index;
}

const NOT_A_MONGO_ID = { $not: /^[0-9a-fA-F]{24}$/ };

/**
 * Rewrite legacy alert rows' portal student ids to the student's Mongo id, scoped by owner
 * (the same rewrite `integrations.ts` performs when a student is linked). A portal id that
 * matches two of the owner's students (siblings on different portals sharing an id, e.g.
 * `skyward:1001` and `aeries:1001` both answering to `1001`) is left alone and counted as
 * ambiguous rather than guessed; so is one that matches nobody. Idempotent: rows already
 * carrying a Mongo id are never selected.
 */
export async function rewriteAlertStudentIds(
  db: Db,
  apply: boolean
): Promise<IAlertStudentIdStats> {
  const alerts = db.collection<ILegacyAlertRow>('alerts');
  const writer = new BulkUpdater(alerts, apply);
  let scanned = 0;
  let rewritten = 0;
  let ambiguous = 0;
  let unresolved = 0;

  const owners = await alerts.distinct('userId', { studentId: NOT_A_MONGO_ID });
  for (const owner of owners) {
    if (typeof owner !== 'string') continue;
    const index = await keyIndexFor(db, owner);
    const cursor = alerts.find(
      { userId: owner, studentId: NOT_A_MONGO_ID },
      { projection: { _id: 1, studentId: 1 } }
    );
    for await (const row of cursor) {
      scanned += 1;
      const candidates =
        typeof row.studentId === 'string' ? index.get(row.studentId.trim()) : undefined;
      if (!candidates || candidates.size === 0) {
        unresolved += 1;
        continue;
      }
      if (candidates.size > 1) {
        ambiguous += 1;
        continue;
      }
      rewritten += 1;
      const [mongoId] = [...candidates];
      await writer.add({
        updateOne: { filter: { _id: row._id }, update: { $set: { studentId: mongoId } } },
      });
    }
  }
  await writer.flush();
  return { scanned, rewritten, ambiguous, unresolved };
}

/**
 * One-time S3 rewrite, run by the API itself so no shell access is needed.
 * ALERT_STUDENT_ID_MIGRATION=dry-run logs the plan; =apply rewrites and claims the
 * `one_time_migrations` marker `alert-student-id` atomically. Run it before
 * ALERT_ACK_BY_MIGRATION is not required (the two are independent), but do run it before
 * expecting shared adults to see legacy alerts. Unset the variable once the log shows the result.
 */
export async function alertStudentIdOnBoot(db: Db, log: ILog): Promise<AlertStudentIdOnBootResult> {
  return runOneTimeMigration({
    db,
    log,
    envVar: 'ALERT_STUDENT_ID_MIGRATION',
    markerId: MARKER_ID,
    work: (apply) => rewriteAlertStudentIds(db, apply),
  });
}
