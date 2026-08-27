import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { enqueueGuidanceJobs } from '@scholaracle/agents';
import type { MongoQueue } from '@scholaracle/agents';
import type { ISlcDeltaOp, ISlcAssignment } from '@scholaracle/contracts';

export async function scheduleGuidanceJobsFromOps(params: {
  readonly queue?: MongoQueue;
  readonly database: Db;
  readonly userId: string;
  readonly timezone: string;
  readonly ops: readonly ISlcDeltaOp[];
  readonly now?: Date;
}): Promise<void> {
  if (params.queue === undefined) return;
  const now = params.now ?? new Date();
  for (const op of params.ops) {
    if (op.entity !== 'assignment' || op.op !== 'upsert') continue;
    const record = op.record as ISlcAssignment | undefined;
    if (record?.dueAt === undefined || record.dueAt === '') continue;
    const studentExt = op.key.studentExternalId;
    if (studentExt === undefined || studentExt === '') continue;
    const student = await findOwnedStudent(params.database, params.userId, studentExt);
    if (student === null) continue;
    const dueAt = new Date(record.dueAt);
    if (Number.isNaN(dueAt.getTime())) continue;
    await enqueueGuidanceJobs(
      params.queue,
      {
        studentId: student,
        assignmentExternalId: op.key.externalId,
        title: record.title,
        dueAt,
        timezone: params.timezone,
      },
      now
    );
  }
}

async function findOwnedStudent(
  database: Db,
  userId: string,
  studentExternalId: string
): Promise<string | null> {
  const or: Record<string, unknown>[] = [{ userId }];
  if (ObjectId.isValid(userId)) {
    or.push({ userId: new ObjectId(userId) });
  }
  const student = await database.collection('students').findOne({
    studentId: studentExternalId,
    $or: or,
  });
  return student?._id?.toString() ?? null;
}
