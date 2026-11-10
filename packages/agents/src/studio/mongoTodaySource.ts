import type { Db, Document } from 'mongodb';
import type { Student } from '@scholaracle/database';
import { STUDENT_STATUSES, type ICourseMaterial, type StudentStatus } from '@scholaracle/contracts';
import type { IDoneTask, IOpenTask, IWeekSource, IWin } from '@scholaracle/interfaces';
import { deriveTaskNeeds, isHostedMaterial } from '@scholaracle/studio-core';
import { loadStudentMaterials } from './loadStudentMaterials';
import { slcStudentFilter } from './slcStudentFilter';
import {
  DONE_STATUSES,
  classifyOpenTask,
  normalizeStatus,
  studioPrimaryCtaLabel,
  toIsoDate,
} from './studioTaskClassify';

export interface IMongoTodaySourceConfig {
  readonly database: Db;
  readonly student: Student;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
  /** The request's single clock; the route passes the same instant to the composer. */
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

/**
 * The work-pack partition, keyed by assignment, built once from the one
 * materials load Today already does. Hosted file and mime come from the same
 * list via `isHostedMaterial`, so the CTA label and `needs` cannot disagree.
 * Course-scoped materials (null assignment) are not needs.
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

/**
 * When the portal says the work was finished. Never guess from the due date:
 * submittedAt, else gradedAt, else — only when the student also marked it
 * done — the document's last update. No evidence, no "this week".
 */
function finishedAt(doc: Document, rec: Record<string, unknown> | undefined): string | undefined {
  const fromPortal = toIsoDate(rec?.['submittedAt']) ?? toIsoDate(rec?.['gradedAt']);
  if (fromPortal !== undefined) return fromPortal;
  if (parseStudentStatus(doc['studentStatus']) !== 'done') return undefined;
  return toIsoDate(doc['updatedAt']);
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
        if (normalizeStatus(rec?.['status']) !== 'graded') continue;
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
      const linked = materialsByAssignment(materials);
      const tasks: IOpenTask[] = [];
      for (const doc of assignmentDocs) {
        const rec = asRecord(doc['record']);
        const dueIso = toIsoDate(rec?.['dueAt']);
        const dueAt = dueIso !== undefined ? new Date(dueIso) : undefined;
        const kind = classifyOpenTask(normalizeStatus(rec?.['status']), dueAt, now);
        if (kind === null) continue;
        const assignmentExternalId = str(doc['externalId']);
        const title = str(rec?.['title']);
        if (assignmentExternalId === '' || title === '') continue;
        const courseExternalId = str(doc['courseExternalId']);
        const forAssignment = linked.get(assignmentExternalId) ?? [];
        const hosted = forAssignment.find(isHostedMaterial);
        const studentStatus = parseStudentStatus(doc['studentStatus']);
        const lmsUrl = str(rec?.['url']);
        tasks.push({
          kind,
          assignmentExternalId,
          title,
          courseName: courseNames.get(courseExternalId) ?? courseExternalId,
          courseExternalId,
          primaryCtaLabel: studioPrimaryCtaLabel(hosted !== undefined, hosted?.mimeType),
          needs: deriveTaskNeeds(forAssignment, lmsUrl !== '' ? lmsUrl : undefined),
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
        if (!DONE_STATUSES.has(normalizeStatus(rec?.['status']))) continue;
        const doneAt = finishedAt(doc, rec);
        const assignmentExternalId = str(doc['externalId']);
        const title = str(rec?.['title']);
        if (doneAt === undefined || assignmentExternalId === '' || title === '') continue;
        const dueAt = toIsoDate(rec?.['dueAt']);
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
