import type { Db, ObjectId } from 'mongodb';
import { SlcBindingRepository, Student, StudentRepository } from '@scholaracle/database';

export const LEGACY_BACKFILL_PORTAL_ACCOUNT_ID = 'legacy-backfill';

export const SLC_ENTITY_COLLECTIONS_FOR_BINDINGS = [
  'slc_assignments',
  'slc_event_series',
  'slc_event_overrides',
  'slc_courses',
  'slc_grade_snapshots',
  'slc_attendance_events',
  'slc_academic_terms',
  'slc_institutions',
  'slc_teachers',
  'slc_course_materials',
  'slc_messages',
  'slc_student_profiles',
] as const;

export interface IBindingTriplet {
  readonly userId: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
}

export interface IBackfillBindingsStats {
  readonly scanned: number;
  readonly wouldUpsert: number;
  readonly upserted: number;
  readonly skippedAmbiguous: number;
  readonly skippedUnresolved: number;
  readonly skippedAlreadyBound: number;
}

export function externalIdFromStudentId(studentId: string | undefined): string | undefined {
  if (!studentId) return undefined;
  const parts = studentId.split(':', 2);
  return parts.length === 2 ? parts[1]! : studentId;
}

export function normalizeTenantUserId(userId: unknown): string | null {
  if (typeof userId === 'string' && userId.trim()) return userId;
  if (userId && typeof userId === 'object' && 'toHexString' in userId) {
    return (userId as ObjectId).toHexString();
  }
  return null;
}

export function matchesStudentExternalId(student: Student, studentExternalId: string): boolean {
  const ext = externalIdFromStudentId(student.studentId);
  if (ext === studentExternalId) return true;
  return student._id?.toHexString() === studentExternalId;
}

export type StudentBindingResolution = Student | 'ambiguous' | 'unresolved';

export function resolveStudentForBinding(
  students: readonly Student[],
  sourceId: string,
  studentExternalId: string
): StudentBindingResolution {
  const matches = students.filter(
    (s) =>
      s.dataSources.some((ds) => ds.id === sourceId) &&
      matchesStudentExternalId(s, studentExternalId)
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) return 'ambiguous';
  return 'unresolved';
}

function tripletKey(t: IBindingTriplet): string {
  return `${t.userId}\0${t.sourceId}\0${t.studentExternalId}`;
}

function dedupeTriplets(triplets: readonly IBindingTriplet[]): IBindingTriplet[] {
  const seen = new Set<string>();
  const out: IBindingTriplet[] = [];
  for (const t of triplets) {
    const key = tripletKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function collectTripletsFromRuns(db: Db): Promise<IBindingTriplet[]> {
  const triplets: IBindingTriplet[] = [];
  const cursor = db.collection('slc_runs').find({});
  for await (const doc of cursor) {
    const userId = normalizeTenantUserId(doc['userId']);
    const sourceId = doc['sourceId'] as string | undefined;
    if (!userId || !sourceId?.trim()) continue;
    const coverage = doc['coverage'] as
      { students?: ReadonlyArray<{ studentExternalId?: string }> } | null | undefined;
    const rows = coverage?.students ?? [];
    for (const row of rows) {
      const studentExternalId = row.studentExternalId;
      if (typeof studentExternalId === 'string' && studentExternalId.trim()) {
        triplets.push({ userId, sourceId, studentExternalId });
      }
    }
  }
  return triplets;
}

async function collectTripletsFromEntities(
  db: Db,
  studentRepo: StudentRepository
): Promise<IBindingTriplet[]> {
  const pairs = new Map<string, { userId: string; studentExternalId: string }>();

  for (const collName of SLC_ENTITY_COLLECTIONS_FOR_BINDINGS) {
    const groups = await db
      .collection(collName)
      .aggregate<{ _id: { userId: unknown; studentExternalId: string } }>([
        {
          $match: {
            studentExternalId: { $type: 'string', $ne: '' },
            userId: { $exists: true },
          },
        },
        { $group: { _id: { userId: '$userId', studentExternalId: '$studentExternalId' } } },
      ])
      .toArray();

    for (const g of groups) {
      const userId = normalizeTenantUserId(g._id.userId);
      const studentExternalId = g._id.studentExternalId;
      if (!userId || !studentExternalId) continue;
      pairs.set(`${userId}\0${studentExternalId}`, { userId, studentExternalId });
    }
  }

  const triplets: IBindingTriplet[] = [];
  const studentsByUser = new Map<string, readonly Student[]>();

  for (const pair of pairs.values()) {
    let students = studentsByUser.get(pair.userId);
    if (!students) {
      students = await studentRepo.findByUserId(pair.userId);
      studentsByUser.set(pair.userId, students);
    }
    for (const student of students) {
      if (!matchesStudentExternalId(student, pair.studentExternalId)) continue;
      for (const ds of student.dataSources) {
        if (!ds.id) continue;
        triplets.push({
          userId: pair.userId,
          sourceId: ds.id,
          studentExternalId: pair.studentExternalId,
        });
      }
    }
  }

  return triplets;
}

export async function collectBindingTriplets(db: Db): Promise<IBindingTriplet[]> {
  const studentRepo = new StudentRepository(db);
  const fromRuns = await collectTripletsFromRuns(db);
  const fromEntities = await collectTripletsFromEntities(db, studentRepo);
  return dedupeTriplets([...fromRuns, ...fromEntities]);
}

export async function backfillBindings(params: {
  readonly db: Db;
  readonly apply: boolean;
}): Promise<IBackfillBindingsStats> {
  const triplets = await collectBindingTriplets(params.db);
  const bindingRepo = new SlcBindingRepository(params.db);
  const studentRepo = new StudentRepository(params.db);
  const studentsByUser = new Map<string, readonly Student[]>();

  const stats = {
    scanned: triplets.length,
    wouldUpsert: 0,
    upserted: 0,
    skippedAmbiguous: 0,
    skippedUnresolved: 0,
    skippedAlreadyBound: 0,
  };

  for (const triplet of triplets) {
    let students = studentsByUser.get(triplet.userId);
    if (!students) {
      students = await studentRepo.findByUserId(triplet.userId);
      studentsByUser.set(triplet.userId, students);
    }

    const resolved = resolveStudentForBinding(
      students,
      triplet.sourceId,
      triplet.studentExternalId
    );
    if (resolved === 'ambiguous') {
      stats.skippedAmbiguous += 1;
      continue;
    }
    if (resolved === 'unresolved') {
      stats.skippedUnresolved += 1;
      continue;
    }

    const ownerUserId = resolved.dataUserId();
    const has = await bindingRepo.hasBindingForSourceStudent(
      ownerUserId,
      triplet.sourceId,
      triplet.studentExternalId
    );
    if (has) {
      stats.skippedAlreadyBound += 1;
      continue;
    }

    stats.wouldUpsert += 1;

    if (params.apply) {
      const existingBinding = await bindingRepo.findByUserIdAndSourceId(
        ownerUserId,
        triplet.sourceId
      );
      const portalAccountId = existingBinding?.portalAccountId ?? LEGACY_BACKFILL_PORTAL_ACCOUNT_ID;
      const studentOid = resolved._id;
      if (!studentOid) {
        stats.skippedUnresolved += 1;
        stats.wouldUpsert -= 1;
        continue;
      }
      await bindingRepo.upsert({
        userId: ownerUserId,
        portalAccountId,
        studentId: studentOid.toHexString(),
        sourceId: triplet.sourceId,
        studentExternalId: triplet.studentExternalId,
      });
      stats.upserted += 1;
    }
  }

  return { ...stats };
}
