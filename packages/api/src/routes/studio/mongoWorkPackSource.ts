import type { Db } from 'mongodb';
import { NotFoundError, type IStudentMaterialsResponse } from '@scholaracle/contracts';
import type { Student } from '@scholaracle/database';
import type { IWorkPackAssignment, IWorkPackSource } from '@scholaracle/interfaces';
import { loadStudentMaterials } from '../../services/materials/loadStudentMaterials';
import { slcStudentFilter } from './studioScope';
import { toIsoDate } from './studioTaskClassify';

export interface IMongoWorkPackSourceConfig {
  readonly database: Db;
  readonly student: Student;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function createMongoWorkPackSource(config: IMongoWorkPackSourceConfig): IWorkPackSource {
  const student = config.student;
  const ownerUserId = student.dataUserId();
  const studentDbId = student._id?.toString() ?? '';
  const studentExternalId = student.studentId ?? '';

  return {
    loadAssignment: async (assignmentExternalId: string): Promise<IWorkPackAssignment> => {
      const doc = await config.database.collection('slc_assignments').findOne({
        ...slcStudentFilter(student),
        externalId: assignmentExternalId,
      });
      if (doc === null) {
        throw new NotFoundError('Assignment not found');
      }
      const rec = asRecord(doc['record']);
      const courseExternalId = (doc['courseExternalId'] as string | undefined) ?? '';
      const courseDoc = await config.database.collection('slc_courses').findOne({
        userId: ownerUserId,
        deletedAt: null,
        externalId: courseExternalId,
      });
      const courseRec = asRecord(courseDoc?.['record']);
      const courseName =
        (typeof courseRec?.['name'] === 'string' ? courseRec['name'] : undefined) ??
        courseExternalId;
      const title = typeof rec?.['title'] === 'string' ? rec['title'] : '';
      const status = typeof rec?.['status'] === 'string' ? rec['status'] : 'unknown';
      const descriptionHtml =
        typeof rec?.['description'] === 'string' ? rec['description'] : undefined;
      const lmsUrl = typeof rec?.['url'] === 'string' ? rec['url'] : undefined;
      const dueAt = toIsoDate(rec?.['dueAt']);
      return {
        assignmentExternalId,
        title,
        courseName,
        status,
        ...(dueAt !== undefined ? { dueAt } : {}),
        ...(descriptionHtml !== undefined ? { descriptionHtml } : {}),
        ...(lmsUrl !== undefined ? { lmsUrl } : {}),
      };
    },

    loadMaterials: async (assignmentExternalId: string): Promise<IStudentMaterialsResponse> => {
      return loadStudentMaterials({
        database: config.database,
        ownerUserId,
        studentDbId,
        studentExternalId,
        studentName: student.name,
        assignmentExternalId,
        baseUrl: config.baseUrl,
        jwtSecret: config.jwtSecret,
      });
    },
  };
}
