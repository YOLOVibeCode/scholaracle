import type { Db } from 'mongodb';
import type { ICourseMaterial, IStudentMaterialsResponse } from '@scholaracle/contracts';
import { signAssetUrl } from '../assets/signedUrl';
import { resolveApiBaseUrl } from '../../routes/students/attachmentSigning';

export interface ILoadStudentMaterialsParams {
  readonly database: Db;
  readonly ownerUserId: string;
  readonly studentDbId: string;
  readonly studentExternalId: string;
  readonly studentName: string;
  readonly courseFilter?: string;
  readonly assignmentExternalId?: string;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
}

type AssetInfo = {
  readonly assetId: string;
  readonly fileSize?: number;
  readonly mimeType?: string;
  readonly contentHash?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function slcStudentOr(studentDbId: string, studentExternalId: string): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  if (studentDbId !== '') or.push({ studentId: studentDbId });
  if (studentExternalId !== '') or.push({ studentExternalId });
  if (or.length === 0) return { userId: '__none__' };
  return { $or: or };
}

/**
 * Owner-scoped course materials for one student. Shared by the parent
 * materials route and the student work-pack adapter.
 */
export async function loadStudentMaterials(
  params: ILoadStudentMaterialsParams
): Promise<IStudentMaterialsResponse> {
  const baseUrl = resolveApiBaseUrl(params.baseUrl);
  const materialsColl = params.database.collection('slc_course_materials');
  const coursesColl = params.database.collection('slc_courses');
  const assetsColl = params.database.collection('slc_assets');

  const studentOr = slcStudentOr(params.studentDbId, params.studentExternalId);
  const materialFilter = {
    userId: params.ownerUserId,
    deletedAt: null,
    ...studentOr,
  };

  let assignmentCourseId: string | null = null;
  if (params.assignmentExternalId !== undefined) {
    const assignmentDoc = await params.database.collection('slc_assignments').findOne({
      userId: params.ownerUserId,
      deletedAt: null,
      externalId: params.assignmentExternalId,
      ...studentOr,
    });
    assignmentCourseId = (assignmentDoc?.['courseExternalId'] as string | undefined) ?? null;
  }

  const [materialDocs, courseDocs, assetDocs] = await Promise.all([
    materialsColl.find(materialFilter).toArray(),
    coursesColl.find({ userId: params.ownerUserId, deletedAt: null }).toArray(),
    assetsColl
      .find({ userId: params.ownerUserId, deletedAt: null, entityType: 'courseMaterial' })
      .toArray(),
  ]);

  const courseMap = new Map<string, string>();
  for (const course of courseDocs) {
    const extId = course['externalId'] as string | undefined;
    const rec = asRecord(course['record']);
    const name = optionalString(rec?.['name']) ?? extId;
    if (extId !== undefined && extId !== '' && name !== undefined) {
      courseMap.set(extId, name);
    }
  }

  const assetMap = new Map<string, AssetInfo>();
  for (const asset of assetDocs) {
    const entityExtId = (asset['entityExternalId'] ?? asset['entityId']) as string | undefined;
    if (entityExtId === undefined || entityExtId === '') continue;
    const hash = asset['contentHash'] as string | undefined;
    assetMap.set(entityExtId, {
      assetId: ((asset['assetId'] ?? asset['_id']?.toString()) as string) ?? '',
      fileSize: asset['fileSize'] as number | undefined,
      mimeType: asset['mimeType'] as string | undefined,
      ...(hash !== undefined && hash !== '' ? { contentHash: hash } : {}),
    });
  }

  const grouped = new Map<string, ICourseMaterial[]>();
  for (const doc of materialDocs) {
    const courseExtId = (doc['courseExternalId'] as string | undefined) ?? '';
    if (params.courseFilter !== undefined && courseExtId !== params.courseFilter) continue;

    const rec = asRecord(doc['record']);
    if (params.assignmentExternalId !== undefined) {
      const matAssignmentId = rec?.['assignmentExternalId'] as string | undefined;
      const matchAssignment = matAssignmentId === params.assignmentExternalId;
      const matchCourse = assignmentCourseId !== null && courseExtId === assignmentCourseId;
      if (!matchAssignment && !matchCourse) continue;
    }

    const extId = (doc['externalId'] as string | undefined) ?? '';
    const asset = assetMap.get(extId);
    const url = optionalString(rec?.['url'] ?? doc['url']);
    const fileName = optionalString(rec?.['fileName'] ?? doc['fileName']);
    const mimeType = asset?.mimeType ?? optionalString(rec?.['mimeType'] ?? doc['mimeType']);
    const postedAt = optionalString(rec?.['postedAt'] ?? doc['postedAt']);
    const description = optionalString(rec?.['description'] ?? doc['description']);
    const extractedText = optionalString(rec?.['extractedText']);
    const fileSize = asset?.fileSize ?? (doc['fileSize'] as number | undefined);
    const linkAccessibility = rec?.['linkAccessibility'] as
      ICourseMaterial['linkAccessibility'] | undefined;

    let downloadUrl: string | undefined;
    if (asset !== undefined && asset.assetId !== '') {
      downloadUrl =
        params.jwtSecret !== undefined && params.jwtSecret !== '' && baseUrl !== ''
          ? signAssetUrl(baseUrl, asset.assetId, params.jwtSecret)
          : `${baseUrl}/api/assets/${asset.assetId}`;
    }

    const material: ICourseMaterial = {
      externalId: extId,
      title: (optionalString(rec?.['title'] ?? rec?.['name'] ?? doc['title']) ?? '') as string,
      type: (optionalString(rec?.['type'] ?? doc['type']) ?? 'document') as string,
      assignmentExternalId: optionalString(rec?.['assignmentExternalId']) ?? null,
      ...(url !== undefined ? { url } : {}),
      ...(fileName !== undefined ? { fileName } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(postedAt !== undefined ? { postedAt } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(extractedText !== undefined ? { extractedText } : {}),
      ...(fileSize !== undefined ? { fileSize } : {}),
      ...(asset?.assetId !== undefined && asset.assetId !== '' ? { assetId: asset.assetId } : {}),
      ...(asset?.contentHash !== undefined ? { contentHash: asset.contentHash } : {}),
      ...(downloadUrl !== undefined ? { downloadUrl } : {}),
      ...(linkAccessibility !== undefined ? { linkAccessibility } : {}),
    };

    const list = grouped.get(courseExtId);
    if (list) {
      list.push(material);
    } else {
      grouped.set(courseExtId, [material]);
    }
  }

  const courses = [...grouped.entries()].map(([courseExternalId, materials]) => ({
    courseExternalId,
    courseName: courseMap.get(courseExternalId) ?? courseExternalId,
    materials,
  }));

  return {
    studentId: params.studentDbId,
    studentName: params.studentName,
    totalMaterials: courses.reduce((sum, course) => sum + course.materials.length, 0),
    courses,
  };
}
