/**
 * Build the `IOfflinePackResponse` for a student's course.
 *
 * The response includes all current-term assignments for the course (as IWorkPackView),
 * plus a deduplicated list of asset refs the client can use to pre-fetch bytes before
 * going offline.
 *
 * IDOR: only returns data in the student's own data partition. Returns NotFoundError
 * when the course does not exist in that partition.
 */

import type { Db } from 'mongodb';
import type { Student } from '@scholaracle/database';
import { NotFoundError } from '@scholaracle/contracts';
import { WorkPack } from '@scholaracle/studio-core';
import { signAssetUrl } from '../../services/assets/signedUrl';
import { resolveApiBaseUrl } from '../students/attachmentSigning';
import { slcStudentFilter } from './studioScope';
import { createMongoWorkPackSource } from './mongoWorkPackSource';

export interface IOfflineAssetRef {
  readonly assetId: string;
  readonly contentHash: string;
  readonly fileName: string;
  readonly mimeType?: string;
  /** 24h signed download ticket. Never cache this URL — it expires. */
  readonly downloadUrl: string;
}

export interface IOfflinePackResponse {
  readonly courseExternalId: string;
  readonly courseName: string;
  /** Server-clock ISO timestamp of when this pack was assembled. */
  readonly assembledAt: string;
  readonly packs: readonly unknown[];
  readonly assets: readonly IOfflineAssetRef[];
}

export interface IBuildOfflinePackParams {
  readonly database: Db;
  readonly student: Student;
  readonly courseExternalId: string;
  readonly baseUrl: string;
  readonly jwtSecret?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export async function buildOfflinePack(
  params: IBuildOfflinePackParams
): Promise<IOfflinePackResponse> {
  const { database, student, courseExternalId, baseUrl, jwtSecret } = params;
  const resolvedBaseUrl = resolveApiBaseUrl(baseUrl);
  const ownerUserId = student.dataUserId();

  // Verify the course exists at the owner level
  const studentFilter = slcStudentFilter(student);
  const courseDoc = await database.collection('slc_courses').findOne({
    userId: ownerUserId,
    deletedAt: null,
    externalId: courseExternalId,
  });
  if (courseDoc === null) {
    throw new NotFoundError(`Course not found: ${courseExternalId}`);
  }

  // IDOR gate: verify this student has at least one assignment for this course.
  // Courses are scoped to the parent owner, but assignments carry the student
  // partition (studentId / studentExternalId). This prevents Student A from
  // reading Student B's offline pack even when both are under the same parent.
  const studentAssignmentCheck = await database.collection('slc_assignments').findOne({
    ...studentFilter,
    courseExternalId,
  });
  if (studentAssignmentCheck === null) {
    throw new NotFoundError(`Course not found: ${courseExternalId}`);
  }
  const courseRec = asRecord(courseDoc['record']);
  const courseName = optString(courseRec?.['name'] ?? courseRec?.['title']) ?? courseExternalId;

  // Find all assignments for this course in the student's partition
  const assignmentDocs = await database
    .collection('slc_assignments')
    .find({
      ...studentFilter,
      courseExternalId,
    })
    .toArray();

  if (assignmentDocs.length === 0) {
    // Course exists but no assignments — return empty packs, valid response
    return {
      courseExternalId,
      courseName,
      assembledAt: new Date().toISOString(),
      packs: [],
      assets: [],
    };
  }

  // Build a work pack for each assignment
  const workPackSource = createMongoWorkPackSource({
    database,
    student,
    baseUrl: resolvedBaseUrl,
    jwtSecret,
  });
  const workPack = new WorkPack(workPackSource);
  const studentSession = {
    studentId: student._id?.toString() ?? '',
    displayName: student.name,
    showGrades: student.studentLogin?.showGrades === true,
  };

  const packs: unknown[] = [];
  for (const doc of assignmentDocs) {
    const externalId = (doc['externalId'] as string | undefined) ?? '';
    if (!externalId) continue;
    try {
      const view = await workPack.load(studentSession, externalId);
      packs.push(view);
    } catch {
      // Fail-open: skip assignments that error
    }
  }

  // Collect deduplicated asset refs from all packs and course materials
  const materialDocs = await database
    .collection('slc_course_materials')
    .find({ ...studentFilter, courseExternalId })
    .toArray();

  const assetExternalIds = new Set<string>();
  for (const doc of materialDocs) {
    const extId = (doc['externalId'] as string | undefined) ?? '';
    if (extId) assetExternalIds.add(extId);
  }

  const assetDocs =
    assetExternalIds.size > 0
      ? await database
          .collection('slc_assets')
          .find({
            userId: ownerUserId,
            deletedAt: null,
            entityType: 'courseMaterial',
            entityExternalId: { $in: [...assetExternalIds] },
          })
          .toArray()
      : [];

  const assets: IOfflineAssetRef[] = [];
  const seenAssetIds = new Set<string>();

  for (const assetDoc of assetDocs) {
    const assetId =
      ((assetDoc['assetId'] ?? assetDoc['_id']?.toString()) as string | undefined) ?? '';
    if (!assetId || seenAssetIds.has(assetId)) continue;
    const contentHash = (assetDoc['contentHash'] as string | undefined) ?? '';
    if (!contentHash) continue;
    const fileName = (assetDoc['fileName'] as string | undefined) ?? '';
    const mimeType = assetDoc['mimeType'] as string | undefined;

    const downloadUrl =
      jwtSecret !== undefined && jwtSecret !== '' && resolvedBaseUrl !== ''
        ? signAssetUrl(resolvedBaseUrl, assetId, jwtSecret)
        : `${resolvedBaseUrl}/api/assets/${assetId}/file`;

    seenAssetIds.add(assetId);
    assets.push({
      assetId,
      contentHash,
      fileName,
      ...(mimeType !== undefined ? { mimeType } : {}),
      downloadUrl,
    });
  }

  return {
    courseExternalId,
    courseName,
    assembledAt: new Date().toISOString(),
    packs,
    assets,
  };
}
