/**
 * Wire contract for GET /api/students/:id/materials (query params: ?course=,
 * ?assignment=).
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts
 * (materials handler). Web keeps a hand-mirror at
 * packages/web/lib/api/students.ts — update it manually if this changes.
 *
 * NOTE on ?assignment= semantics: the filter is an OR — exact assignment
 * matches PLUS every material in that assignment's course. Clients separate
 * the two via `assignmentExternalId` (null = course-scoped).
 *
 * `contentHash` is the client cache validator (key with assetId). `downloadUrl`
 * is a signed 24h fetch ticket — never cache that URL, only the bytes.
 */

export type MaterialLinkAccessibility = 'public' | 'authenticated' | 'unknown';

export interface ICourseMaterial {
  readonly externalId: string;
  readonly title: string;
  readonly type: string;
  readonly url?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly postedAt?: string;
  readonly description?: string;
  readonly fileSize?: number;
  readonly assetId?: string;
  /**
   * Hash of the stored bytes. Cache key is assetId + contentHash.
   * Absent when the material is a link with no hosted file.
   */
  readonly contentHash?: string;
  /** Signed asset URL (24h TTL, no auth header needed). Never cache this URL. */
  readonly downloadUrl?: string;
  readonly linkAccessibility?: MaterialLinkAccessibility;
  /** The assignment this material is linked to; null = course-scoped. */
  readonly assignmentExternalId: string | null;
}

export interface ICourseMaterials {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly materials: readonly ICourseMaterial[];
}

export interface IStudentMaterialsResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly totalMaterials: number;
  readonly courses: readonly ICourseMaterials[];
}
