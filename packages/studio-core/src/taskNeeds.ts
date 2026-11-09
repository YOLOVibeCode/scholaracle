import type { ICourseMaterial, WeekNeed } from '@scholaracle/contracts';
import { isSchoolLoginHost } from './urlHost';

/**
 * What a student needs to do one assignment, read off the materials already
 * linked to it (the work-pack partition). No per-item fetch.
 *
 * - `saved_file`: a hosted file the app can cache offline.
 * - `school_login`: a link that needs the school portal login, or the LMS page
 *   when it is the only way in.
 * - `internet`: a public link that was not captured as readable text.
 *
 * Order is fixed: saved_file, school_login, internet.
 */
export function deriveTaskNeeds(
  forAssignment: readonly ICourseMaterial[],
  lmsUrl?: string
): WeekNeed[] {
  const needs = new Set<WeekNeed>();
  for (const material of forAssignment) {
    if (isHosted(material)) {
      needs.add('saved_file');
      continue;
    }
    const url = material.url;
    if (url === undefined || url === '') continue;
    if (material.linkAccessibility === 'authenticated' || isSchoolLoginHost(url)) {
      needs.add('school_login');
      continue;
    }
    if (material.extractedText !== undefined && material.extractedText !== '') continue;
    needs.add('internet');
  }
  if (needs.size === 0 && lmsUrl !== undefined && lmsUrl !== '') {
    needs.add('school_login');
  }
  return ORDER.filter((need) => needs.has(need));
}

const ORDER: readonly WeekNeed[] = ['saved_file', 'school_login', 'internet'];

function isHosted(material: ICourseMaterial): boolean {
  if (material.downloadUrl !== undefined && material.downloadUrl !== '') return true;
  return Boolean(material.assetId) && Boolean(material.contentHash);
}
