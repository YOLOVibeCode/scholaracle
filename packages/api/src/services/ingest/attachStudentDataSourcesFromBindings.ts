import type { Db } from 'mongodb';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { SlcBindingRepository, StudentRepository } from '@scholaracle/database';

/** Ensure bound students have the ingest source on their dataSources record. */
export async function attachStudentDataSourcesFromBindings(params: {
  readonly database: Db;
  readonly userId: string;
  readonly sourceId: string;
  readonly ops: readonly ISlcDeltaOp[];
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl?: string;
}): Promise<void> {
  const bindingRepo = new SlcBindingRepository(params.database);
  const studentRepo = new StudentRepository(params.database);
  const students = await studentRepo.findByUserId(params.userId);

  const extIds = new Set<string>();
  for (const op of params.ops) {
    const ext = op.key?.studentExternalId;
    if (typeof ext === 'string' && ext.trim()) extIds.add(ext);
  }

  for (const studentExternalId of extIds) {
    const hasBinding = await bindingRepo.hasBindingForSourceStudent(
      params.userId,
      params.sourceId,
      studentExternalId
    );
    if (!hasBinding) continue;

    const existing = students.find((s) => {
      if (!s.studentId) return s._id?.toHexString() === studentExternalId;
      const parts = s.studentId.split(':', 2);
      const extId = parts.length === 2 ? parts[1]! : s.studentId;
      return extId === studentExternalId || s._id?.toHexString() === studentExternalId;
    });
    if (!existing?._id) continue;

    let institutionExternalId: string | undefined;
    for (const op of params.ops) {
      if (op.key?.studentExternalId === studentExternalId) {
        const inst = op.key?.institutionExternalId;
        if (typeof inst === 'string') institutionExternalId = inst;
      }
    }

    const newDataSource = {
      id: params.sourceId,
      pluginId: params.adapterId,
      enabled: true,
      provider: params.provider,
      baseUrl: params.portalBaseUrl,
      institutionExternalId,
    };
    const hasSource = existing.dataSources.some((ds) => ds.id === params.sourceId);
    if (!hasSource) {
      await studentRepo.update(existing._id, {
        dataSources: [...existing.dataSources, newDataSource],
      });
    }
    if (existing.studentId && existing.studentId.includes(':')) {
      await studentRepo.update(existing._id, { studentId: studentExternalId });
    } else if (!existing.studentId && studentExternalId !== existing._id.toHexString()) {
      await studentRepo.update(existing._id, { studentId: studentExternalId });
    }
  }
}
