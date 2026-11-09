import type { Db } from 'mongodb';
import {
  PLAN_FEATURES,
  StudentRepository,
  SubscriptionRepository,
  type SubscriptionPlan,
} from '@scholaracle/database';
import type { ISlcDeltaOp } from '@scholaracle/contracts';

export const INGEST_PLAN_LIMIT_CODE = 'PLAN_LIMIT' as const;

export interface IIngestStudentPlanLimitDetail {
  readonly currentPlan: SubscriptionPlan;
  readonly maxStudents: number;
  readonly currentCount: number;
}

export class IngestStudentPlanLimitError extends Error {
  public readonly code = INGEST_PLAN_LIMIT_CODE;
  public readonly currentPlan: SubscriptionPlan;
  public readonly maxStudents: number;
  public readonly currentCount: number;

  constructor(detail: IIngestStudentPlanLimitDetail) {
    super(
      `Your ${detail.currentPlan} plan allows up to ${detail.maxStudents} student${detail.maxStudents === 1 ? '' : 's'}. Upgrade to add more.`
    );
    this.currentPlan = detail.currentPlan;
    this.maxStudents = detail.maxStudents;
    this.currentCount = detail.currentCount;
  }
}

function uniqueStudentExternalIds(ops: readonly ISlcDeltaOp[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    const extId = op.key?.studentExternalId;
    if (typeof extId === 'string' && extId.trim()) {
      ids.add(extId);
    }
  }
  return [...ids];
}

function studentMatchesExternalId(
  student: { readonly studentId?: string; readonly _id?: { toString(): string } },
  studentExtId: string
): boolean {
  if (student._id && student._id.toString() === studentExtId) {
    return true;
  }
  if (!student.studentId) {
    return false;
  }
  const parts = student.studentId.split(':', 2);
  const extId = parts.length === 2 ? parts[1]! : student.studentId;
  return extId === studentExtId;
}

/** Counts studentExternalId values in ops that would trigger a new Student row. */
export async function countNewStudentsRequiredByIngestOps(
  database: Db,
  userId: string,
  ops: readonly ISlcDeltaOp[]
): Promise<number> {
  const extIds = uniqueStudentExternalIds(ops);
  if (extIds.length === 0) {
    return 0;
  }
  // Owned only (sharing-spec §4.6): a student shared *with* this account belongs to its owner's
  // plan and must not count here.
  const students = await new StudentRepository(database).findOwnedByUserId(userId);
  let newCount = 0;
  for (const studentExtId of extIds) {
    const exists = students.some((s) => studentMatchesExternalId(s, studentExtId));
    if (!exists) {
      newCount += 1;
    }
  }
  return newCount;
}

export async function assertIngestWithinStudentPlanLimit(
  database: Db,
  userId: string,
  ops: readonly ISlcDeltaOp[]
): Promise<void> {
  const newStudents = await countNewStudentsRequiredByIngestOps(database, userId, ops);
  if (newStudents === 0) {
    return;
  }
  const subscription = await new SubscriptionRepository(database).findByUserId(userId);
  const currentPlan = subscription?.effectivePlan() ?? 'free';
  const maxStudents = PLAN_FEATURES[currentPlan].maxStudents;
  if (maxStudents === -1) {
    return;
  }
  const existingStudents = await new StudentRepository(database).findOwnedByUserId(userId);
  const currentCount = existingStudents.length;
  if (currentCount + newStudents > maxStudents) {
    throw new IngestStudentPlanLimitError({ currentPlan, maxStudents, currentCount });
  }
}
