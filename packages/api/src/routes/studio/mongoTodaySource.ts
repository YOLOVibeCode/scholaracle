import type { Db } from 'mongodb';
import type { Student } from '@scholaracle/database';
import type { IOpenTask, ITodaySource, IWin } from '@scholaracle/interfaces';
import { loadStudentMaterials } from '../../services/materials/loadStudentMaterials';
import { slcStudentFilter } from './studioScope';
import { classifyOpenTask, studioPrimaryCtaLabel, toIsoDate } from './studioTaskClassify';

export interface IMongoTodaySourceConfig {
  readonly database: Db;
  readonly student: Student;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
  readonly now?: Date;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function hostedMimeByAssignment(
  materials: Awaited<ReturnType<typeof loadStudentMaterials>>
): Map<string, string | undefined> {
  const hosted = new Map<string, string | undefined>();
  for (const course of materials.courses) {
    for (const material of course.materials) {
      const assignmentId = material.assignmentExternalId;
      if (assignmentId === null || assignmentId === '') continue;
      if (material.assetId === undefined || material.assetId === '') continue;
      if (material.contentHash === undefined || material.contentHash === '') continue;
      if (!hosted.has(assignmentId)) {
        hosted.set(assignmentId, material.mimeType);
      }
    }
  }
  return hosted;
}

export function createMongoTodaySource(config: IMongoTodaySourceConfig): ITodaySource {
  const now = config.now ?? new Date();
  const student = config.student;
  const ownerUserId = student.dataUserId();
  const studentDbId = student._id?.toString() ?? '';
  const studentExternalId = student.studentId ?? '';

  return {
    recentWins: async (): Promise<readonly IWin[]> => {
      const [assignmentDocs, courseDocs] = await Promise.all([
        config.database.collection('slc_assignments').find(slcStudentFilter(student)).toArray(),
        config.database
          .collection('slc_courses')
          .find({ userId: ownerUserId, deletedAt: null })
          .toArray(),
      ]);
      const courseNames = courseNameMap(
        courseDocs as ReadonlyArray<{ readonly [key: string]: unknown }>
      );
      const wins: IWin[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        const status = typeof rec?.['status'] === 'string' ? rec['status'] : '';
        if (status.toLowerCase() !== 'graded') continue;
        const title = typeof rec?.['title'] === 'string' ? rec['title'] : '';
        if (title === '') continue;
        const courseExternalId = (doc['courseExternalId'] as string | undefined) ?? '';
        wins.push({
          kind: 'graded',
          assignmentExternalId: (doc['externalId'] as string | undefined) ?? '',
          title,
          courseName: courseNames.get(courseExternalId) ?? courseExternalId,
        });
      }
      wins.sort((a, b) => {
        const docA = assignmentDocs.find((d) => d['externalId'] === a.assignmentExternalId);
        const docB = assignmentDocs.find((d) => d['externalId'] === b.assignmentExternalId);
        const dueA = toIsoDate(asRecord(docA?.['record'])?.['dueAt']) ?? '';
        const dueB = toIsoDate(asRecord(docB?.['record'])?.['dueAt']) ?? '';
        return dueB.localeCompare(dueA);
      });
      return wins;
    },

    openTasks: async (): Promise<readonly IOpenTask[]> => {
      const [assignmentDocs, courseDocs, materials] = await Promise.all([
        config.database.collection('slc_assignments').find(slcStudentFilter(student)).toArray(),
        config.database
          .collection('slc_courses')
          .find({ userId: ownerUserId, deletedAt: null })
          .toArray(),
        loadStudentMaterials({
          database: config.database,
          ownerUserId,
          studentDbId,
          studentExternalId,
          studentName: student.name,
          baseUrl: config.baseUrl,
          jwtSecret: config.jwtSecret,
        }),
      ]);
      const courseNames = courseNameMap(
        courseDocs as ReadonlyArray<{ readonly [key: string]: unknown }>
      );
      const hosted = hostedMimeByAssignment(materials);
      const tasks: IOpenTask[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        const status = typeof rec?.['status'] === 'string' ? rec['status'] : '';
        const dueIso = toIsoDate(rec?.['dueAt']);
        const dueAt = dueIso !== undefined ? new Date(dueIso) : undefined;
        const kind = classifyOpenTask(status, dueAt, now);
        if (kind === null) continue;
        const assignmentExternalId = (doc['externalId'] as string | undefined) ?? '';
        const title = typeof rec?.['title'] === 'string' ? rec['title'] : '';
        if (assignmentExternalId === '' || title === '') continue;
        const courseExternalId = (doc['courseExternalId'] as string | undefined) ?? '';
        const mime = hosted.get(assignmentExternalId);
        tasks.push({
          kind,
          assignmentExternalId,
          title,
          courseName: courseNames.get(courseExternalId) ?? courseExternalId,
          courseExternalId,
          primaryCtaLabel: studioPrimaryCtaLabel(hosted.has(assignmentExternalId), mime),
          ...(dueIso !== undefined ? { dueAt: dueIso } : {}),
        });
      }
      return tasks;
    },
  };
}

function courseNameMap(
  courseDocs: ReadonlyArray<{ readonly [key: string]: unknown }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const course of courseDocs) {
    const extId = course['externalId'] as string | undefined;
    const rec = asRecord(course['record']);
    const name = typeof rec?.['name'] === 'string' ? rec['name'] : extId;
    if (extId !== undefined && extId !== '' && name !== undefined) {
      map.set(extId, name);
    }
  }
  return map;
}
