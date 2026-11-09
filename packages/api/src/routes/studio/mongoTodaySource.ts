import type { Db, Document } from 'mongodb';
import type { Student } from '@scholaracle/database';
import { STUDENT_STATUSES, type ICourseMaterial, type StudentStatus } from '@scholaracle/contracts';
import type { IDoneTask, IOpenTask, IWeekSource, IWin } from '@scholaracle/interfaces';
import { deriveTaskNeeds } from '@scholaracle/studio-core';
import { loadStudentMaterials } from '../../services/materials/loadStudentMaterials';
import { slcStudentFilter } from './studioScope';
import {
  DONE_STATUSES,
  classifyOpenTask,
  studioPrimaryCtaLabel,
  toIsoDate,
} from './studioTaskClassify';

export interface IMongoTodaySourceConfig {
  readonly database: Db;
  readonly student: Student;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
  readonly now?: Date;
}

interface IAssignmentDocs {
  readonly assignmentDocs: readonly Document[];
  readonly courseNames: ReadonlyMap<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** `slc_assignments.studentStatus` is set by `PATCH /api/studio/assignments/:id/status`. */
function parseStudentStatus(value: unknown): StudentStatus | undefined {
  if (typeof value !== 'string') return undefined;
  return (STUDENT_STATUSES as readonly string[]).includes(value)
    ? (value as StudentStatus)
    : undefined;
}

type Materials = Awaited<ReturnType<typeof loadStudentMaterials>>;

function hostedMimeByAssignment(materials: Materials): Map<string, string | undefined> {
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

/**
 * The work-pack partition, keyed by assignment, from the one materials load
 * Today already does. Course-scoped materials (null assignment) are not needs.
 */
function materialsByAssignment(materials: Materials): Map<string, ICourseMaterial[]> {
  const byAssignment = new Map<string, ICourseMaterial[]>();
  for (const course of materials.courses) {
    for (const material of course.materials) {
      const assignmentId = material.assignmentExternalId;
      if (assignmentId === null || assignmentId === '') continue;
      const list = byAssignment.get(assignmentId);
      if (list) list.push(material);
      else byAssignment.set(assignmentId, [material]);
    }
  }
  return byAssignment;
}

export function createMongoTodaySource(config: IMongoTodaySourceConfig): IWeekSource {
  const now = config.now ?? new Date();
  const student = config.student;
  const ownerUserId = student.dataUserId();
  const studentDbId = student._id?.toString() ?? '';
  const studentExternalId = student.studentId ?? '';

  // One request = one source instance; the assignment docs are shared by all three reads.
  let docsPromise: Promise<IAssignmentDocs> | undefined;
  const loadDocs = (): Promise<IAssignmentDocs> => {
    docsPromise ??= Promise.all([
      config.database.collection('slc_assignments').find(slcStudentFilter(student)).toArray(),
      config.database
        .collection('slc_courses')
        .find({ userId: ownerUserId, deletedAt: null })
        .toArray(),
    ]).then(([assignmentDocs, courseDocs]) => ({
      assignmentDocs,
      courseNames: courseNameMap(courseDocs),
    }));
    return docsPromise;
  };

  return {
    recentWins: async (): Promise<readonly IWin[]> => {
      const { assignmentDocs, courseNames } = await loadDocs();
      const wins: IWin[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        if (str(rec?.['status']).toLowerCase() !== 'graded') continue;
        const title = str(rec?.['title']);
        if (title === '') continue;
        const courseExternalId = str(doc['courseExternalId']);
        wins.push({
          kind: 'graded',
          assignmentExternalId: str(doc['externalId']),
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
      const [{ assignmentDocs, courseNames }, materials] = await Promise.all([
        loadDocs(),
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
      const hosted = hostedMimeByAssignment(materials);
      const linked = materialsByAssignment(materials);
      const tasks: IOpenTask[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        const dueIso = toIsoDate(rec?.['dueAt']);
        const dueAt = dueIso !== undefined ? new Date(dueIso) : undefined;
        const kind = classifyOpenTask(str(rec?.['status']), dueAt, now);
        if (kind === null) continue;
        const assignmentExternalId = str(doc['externalId']);
        const title = str(rec?.['title']);
        if (assignmentExternalId === '' || title === '') continue;
        const courseExternalId = str(doc['courseExternalId']);
        const mime = hosted.get(assignmentExternalId);
        const studentStatus = parseStudentStatus(doc['studentStatus']);
        const lmsUrl = str(rec?.['url']);
        tasks.push({
          kind,
          assignmentExternalId,
          title,
          courseName: courseNames.get(courseExternalId) ?? courseExternalId,
          courseExternalId,
          primaryCtaLabel: studioPrimaryCtaLabel(hosted.has(assignmentExternalId), mime),
          needs: deriveTaskNeeds(
            linked.get(assignmentExternalId) ?? [],
            lmsUrl !== '' ? lmsUrl : undefined
          ),
          ...(dueIso !== undefined ? { dueAt: dueIso } : {}),
          ...(studentStatus !== undefined ? { studentStatus } : {}),
        });
      }
      return tasks;
    },

    doneThisWeek: async (): Promise<readonly IDoneTask[]> => {
      const { assignmentDocs, courseNames } = await loadDocs();
      const finished: IDoneTask[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        if (!DONE_STATUSES.has(str(rec?.['status']).toLowerCase())) continue;
        const dueAt = toIsoDate(rec?.['dueAt']);
        const doneAt = toIsoDate(rec?.['submittedAt']) ?? toIsoDate(rec?.['gradedAt']) ?? dueAt;
        const assignmentExternalId = str(doc['externalId']);
        const title = str(rec?.['title']);
        if (doneAt === undefined || assignmentExternalId === '' || title === '') continue;
        const courseExternalId = str(doc['courseExternalId']);
        finished.push({
          assignmentExternalId,
          title,
          courseName: courseNames.get(courseExternalId) ?? courseExternalId,
          doneAt,
          ...(dueAt !== undefined ? { dueAt } : {}),
        });
      }
      return finished;
    },
  };
}

function courseNameMap(courseDocs: readonly Document[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const course of courseDocs) {
    const extId = str(course['externalId']);
    const rec = asRecord(course['record']);
    const name = str(rec?.['name']) || extId;
    if (extId !== '' && name !== '') {
      map.set(extId, name);
    }
  }
  return map;
}
