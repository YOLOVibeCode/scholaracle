/**
 * Assignment vs course material split + link classification.
 *
 * The server's ?assignment= filter is an OR — exact assignment matches PLUS
 * every material in that assignment's course — so the client partitions on
 * assignmentExternalId.
 *
 * NEVER use the URL API here: react-native's polyfill is http-only.
 */

import type { ICourseMaterial, IStudentMaterialsResponse } from '@scholaracle/contracts';
import { extractHostname } from './urlHost';

export interface IMaterialPartition {
  readonly forAssignment: ICourseMaterial[];
  readonly courseMaterials: ICourseMaterial[];
}

export function partitionMaterials(
  res: IStudentMaterialsResponse,
  assignmentExternalId: string
): IMaterialPartition {
  const forAssignment: ICourseMaterial[] = [];
  const courseMaterials: ICourseMaterial[] = [];
  for (const course of res.courses) {
    for (const material of course.materials) {
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

export function classifyResource(
  item: { readonly url?: string; readonly downloadUrl?: string },
  apiBaseUrl: string
): IResourceLink {
  if (item.downloadUrl != null && item.downloadUrl !== '') {
    return { href: item.downloadUrl, kind: 'download' };
  }
  const url = item.url;
  if (url == null || url === '') return { href: null, kind: 'none' };
  if (url.startsWith('/')) return { href: null, kind: 'own-unsigned' };
  const host = extractHostname(url);
  if (host !== '' && host === extractHostname(apiBaseUrl)) {
    return { href: null, kind: 'own-unsigned' };
  }
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
