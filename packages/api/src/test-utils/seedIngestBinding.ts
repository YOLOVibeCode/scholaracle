import type { Db } from 'mongodb';
import { SlcBindingRepository, StudentRepository } from '@scholaracle/database';

export async function seedIngestBinding(
  database: Db,
  userId: string,
  params: {
    readonly sourceId: string;
    readonly studentExternalId: string;
    readonly studentId?: string;
  }
): Promise<void> {
  const repo = new SlcBindingRepository(database);
  await repo.upsert({
    userId,
    portalAccountId: 'pa-test',
    studentId: params.studentId ?? params.studentExternalId,
    sourceId: params.sourceId,
    studentExternalId: params.studentExternalId,
  });
}

export async function seedBindingsForEnvelope(
  database: Db,
  userId: string,
  envelope: {
    readonly source?: { readonly sourceId?: string };
    readonly ops: readonly { readonly key?: { readonly studentExternalId?: string } }[];
  }
): Promise<void> {
  const sourceId = envelope.source?.sourceId ?? '';
  if (!sourceId) return;
  const studentIds = new Set<string>();
  for (const op of envelope.ops) {
    const ext = op.key?.studentExternalId;
    if (typeof ext === 'string' && ext.trim()) {
      studentIds.add(ext);
    }
  }
  const studentRepo = new StudentRepository(database);
  const students = await studentRepo.findByUserId(userId);
  for (const studentExternalId of studentIds) {
    const exists = students.some((s) => {
      if (s.studentId === studentExternalId) return true;
      if (!s.studentId) return false;
      const parts = s.studentId.split(':', 2);
      const ext = parts.length === 2 ? parts[1]! : s.studentId;
      return ext === studentExternalId;
    });
    if (!exists) {
      await studentRepo.create({
        userId,
        name: studentExternalId,
        studentId: studentExternalId,
        dataSources: [],
      });
    }
    await seedIngestBinding(database, userId, { sourceId, studentExternalId });
  }
}
