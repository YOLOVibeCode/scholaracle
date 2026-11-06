import type { Db } from 'mongodb';
import type { ISlcRunCoverage, ISourceIngestLastCounts } from '@scholaracle/contracts';
import {
  IngestSourceRepository,
  StudentRepository,
  type IDataSource,
  type IngestSource,
} from '@scholaracle/database';

function externalIdFromStudentId(studentId: string | undefined): string | undefined {
  if (!studentId) return undefined;
  const parts = studentId.split(':', 2);
  return parts.length === 2 ? parts[1]! : studentId;
}

function coverageSliceForStudent(
  full: ISlcRunCoverage | null | undefined,
  studentExternalId: string
): ISlcRunCoverage {
  if (!full?.students?.length) {
    return { students: [] };
  }
  const row = full.students.find((s) => s.studentExternalId === studentExternalId);
  return row ? { students: [row] } : { students: [] };
}

function buildLastCounts(params: {
  readonly coverage: ISlcRunCoverage | null | undefined;
  readonly opCount: number | undefined;
  readonly studentExternalId: string;
}): ISourceIngestLastCounts | undefined {
  if (params.coverage == null && params.opCount === undefined) {
    return undefined;
  }
  const opsTotal = params.opCount ?? 0;
  const slice = coverageSliceForStudent(params.coverage, params.studentExternalId);
  return { opsTotal, coverage: slice };
}

function baseDataSourceFromIngest(
  sourceId: string,
  meta: Pick<IngestSource, 'provider' | 'adapterId'>
): IDataSource {
  return {
    id: sourceId,
    pluginId: meta.adapterId,
    enabled: true,
    provider: meta.provider,
  };
}

/** After a successful ingest commit, refresh per-student data source health fields. */
export async function syncStudentDataSourcesAfterIngestSuccess(params: {
  readonly database: Db;
  readonly dataUserId: string;
  readonly sourceId: string;
  readonly runId: string;
  readonly committedAt: Date;
  readonly coverage: ISlcRunCoverage | null | undefined;
  readonly opCount: number | undefined;
}): Promise<void> {
  const sourceRepo = new IngestSourceRepository(params.database);
  let meta = await sourceRepo.findByUserIdAndSourceId(params.dataUserId, params.sourceId);
  if (!meta) {
    await sourceRepo.upsert({
      userId: params.dataUserId,
      sourceId: params.sourceId,
      provider: 'unknown',
      adapterId: 'unknown',
      displayName: params.sourceId,
    });
    meta = await sourceRepo.findByUserIdAndSourceId(params.dataUserId, params.sourceId);
  }
  if (!meta) return;

  const studentRepo = new StudentRepository(params.database);
  const students = await studentRepo.findOwnedByUserId(params.dataUserId);

  for (const student of students) {
    const extId = externalIdFromStudentId(student.studentId) ?? student._id?.toHexString();
    if (!extId) continue;

    const dsList = [...student.dataSources];
    let idx = dsList.findIndex((d) => d.id === params.sourceId);
    if (idx < 0) {
      dsList.push(baseDataSourceFromIngest(params.sourceId, meta));
      idx = dsList.findIndex((d) => d.id === params.sourceId);
    }
    const prev = dsList[idx]!;
    const lastCounts = buildLastCounts({
      coverage: params.coverage,
      opCount: params.opCount,
      studentExternalId: extId,
    });
    dsList[idx] = {
      ...prev,
      pluginId: prev.pluginId || meta.adapterId,
      provider: prev.provider ?? meta.provider,
      lastSuccessAt: params.committedAt,
      lastSuccess: params.committedAt,
      lastScraped: params.committedAt,
      lastRunId: params.runId,
      ...(lastCounts !== undefined ? { lastCounts } : {}),
      lastError: null,
      status: 'active',
    };
    await studentRepo.update(student._id!, { dataSources: dsList });
  }
}

/** Record a failed run on matching student data sources (by source id). */
export async function syncStudentDataSourcesAfterIngestFailure(params: {
  readonly database: Db;
  readonly dataUserId: string;
  readonly sourceId: string;
  readonly runId: string;
  readonly error: string;
}): Promise<void> {
  const sourceRepo = new IngestSourceRepository(params.database);
  let meta = await sourceRepo.findByUserIdAndSourceId(params.dataUserId, params.sourceId);
  if (!meta) {
    await sourceRepo.upsert({
      userId: params.dataUserId,
      sourceId: params.sourceId,
      provider: 'unknown',
      adapterId: 'unknown',
      displayName: params.sourceId,
    });
    meta = await sourceRepo.findByUserIdAndSourceId(params.dataUserId, params.sourceId);
  }
  if (!meta) return;

  const studentRepo = new StudentRepository(params.database);
  const students = await studentRepo.findOwnedByUserId(params.dataUserId);

  for (const student of students) {
    const extId = externalIdFromStudentId(student.studentId) ?? student._id?.toHexString();
    if (!extId) continue;

    const dsList = [...student.dataSources];
    let idx = dsList.findIndex((d) => d.id === params.sourceId);
    if (idx < 0) {
      dsList.push(baseDataSourceFromIngest(params.sourceId, meta));
      idx = dsList.findIndex((d) => d.id === params.sourceId);
    }
    const prev = dsList[idx]!;
    dsList[idx] = {
      ...prev,
      pluginId: prev.pluginId || meta.adapterId,
      provider: prev.provider ?? meta.provider,
      lastRunId: params.runId,
      lastError: params.error,
      status: 'error',
    };
    await studentRepo.update(student._id!, { dataSources: dsList });
  }
}
