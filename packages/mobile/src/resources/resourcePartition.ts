/**
 * Pure helpers for AssignmentDetailScreen's resources section.
 *
 * The server's ?assignment= filter is an OR — exact assignment matches PLUS
 * every material in that assignment's course — so the client partitions on
 * assignmentExternalId. Old servers may omit assignmentExternalId entirely
 * (treated as course-scoped) and may omit downloadUrl (falls back to the raw
 * portal URL).
 *
 * NEVER use the URL API here: react-native's polyfill is http-only. All host
 * work goes through extractHostname (pure string parsing).
 */

import type { ICourseMaterial, IStudentMaterialsResponse } from '@scholaracle/contracts';
import { extractHostname } from '../utils/urlNormalize';

export interface IMaterialPartition {
  readonly forAssignment: ICourseMaterial[];
  readonly courseMaterials: ICourseMaterial[];
}

/**
 * Flatten every course in the response and split materials into the ones
 * linked to this exact assignment vs everything else (null, another
 * assignment, or an old server that omitted the field). Each bucket is
 * sorted postedAt-descending with undated materials last.
 */
export function partitionMaterials(
  res: IStudentMaterialsResponse,
  assignmentExternalId: string
): IMaterialPartition {
  const forAssignment: ICourseMaterial[] = [];
  const courseMaterials: ICourseMaterial[] = [];
  for (const course of res.courses) {
    for (const material of course.materials) {
      // Old servers omit assignmentExternalId — undefined lands in the
      // course-scoped bucket exactly like an explicit null.
      if (material.assignmentExternalId === assignmentExternalId) {
        forAssignment.push(material);
      } else {
        courseMaterials.push(material);
      }
    }
  }
  return {
    forAssignment: sortByPostedDesc(forAssignment),
    courseMaterials: sortByPostedDesc(courseMaterials),
  };
}

export type ResourceKind = 'download' | 'portal' | 'own-unsigned' | 'none';

export interface IResourceLink {
  readonly href: string | null;
  readonly kind: ResourceKind;
}

/**
 * Decide how a resource link opens:
 * - 'download': signed our-server URL (24h TTL, opens with no auth) — preferred.
 * - 'own-unsigned': unsigned URL on our own host (or a relative path) — would
 *   401 outside the app, so the row is disabled.
 * - 'portal': foreign host (school portal etc.) — opens externally.
 * - 'none': no link at all.
 */
export function classifyResource(
  item: { readonly url?: string; readonly downloadUrl?: string },
  apiBaseUrl: string
): IResourceLink {
  if (item.downloadUrl != null && item.downloadUrl !== '') {
    return { href: item.downloadUrl, kind: 'download' };
  }
  const url = item.url;
  if (url == null || url === '') return { href: null, kind: 'none' };
  // Relative path ('/api/assets/…'): points at our API but unsigned.
  if (url.startsWith('/')) return { href: null, kind: 'own-unsigned' };
  const host = extractHostname(url);
  if (host !== '' && host === extractHostname(apiBaseUrl)) {
    return { href: null, kind: 'own-unsigned' };
  }
  // Foreign host — or a scheme-only link (mailto: etc.) the OS may handle.
  return { href: url, kind: 'portal' };
}

function postedTime(material: ICourseMaterial): number {
  if (material.postedAt == null || material.postedAt === '') return Number.NEGATIVE_INFINITY;
  const time = new Date(material.postedAt).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function sortByPostedDesc(materials: ICourseMaterial[]): ICourseMaterial[] {
  return materials.sort((a, b) => postedTime(b) - postedTime(a));
}
