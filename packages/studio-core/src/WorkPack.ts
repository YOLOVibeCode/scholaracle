import {
  assertNoGradeLeak,
  type ICourseMaterial,
  type IStudentMaterialsResponse,
  type IStudentSession,
  type IWorkPackAsset,
  type IWorkPackLink,
  type IWorkPackMoreItem,
  type IWorkPackView,
  type WorkPackLinkKind,
} from '@scholaracle/contracts';
import type { IWorkPack, IWorkPackAssignment, IWorkPackSource } from '@scholaracle/interfaces';
import { extractDescriptionLinks, stripHtmlToText } from './descriptionLinks';
import { humanAssignmentStatus } from './humanAssignmentStatus';
import { partitionMaterials } from './resourcePartition';
import { isSameNormalizedUrl, isSchoolLoginHost, isInteractiveHomeworkHost } from './urlHost';

export function createStaticWorkPackSource(input: {
  readonly assignment: IWorkPackAssignment;
  readonly materials: IStudentMaterialsResponse;
}): IWorkPackSource {
  return {
    loadAssignment: async (id: string): Promise<IWorkPackAssignment> => {
      if (id !== input.assignment.assignmentExternalId) {
        throw new Error(`unknown assignment ${id}`);
      }
      return input.assignment;
    },
    loadMaterials: async (): Promise<IStudentMaterialsResponse> => input.materials,
  };
}

function isHosted(material: ICourseMaterial): boolean {
  if (material.downloadUrl != null && material.downloadUrl !== '') return true;
  return Boolean(material.assetId) && Boolean(material.contentHash);
}

function toAsset(material: ICourseMaterial): IWorkPackAsset | null {
  if (!isHosted(material)) return null;
  const assetId = material.assetId;
  if (assetId == null || assetId === '') return null;
  const contentHash =
    material.contentHash != null && material.contentHash !== ''
      ? material.contentHash
      : `pending:${assetId}`;
  return {
    assetId,
    contentHash,
    fileName: material.fileName ?? material.title,
    ...(material.mimeType !== undefined ? { mimeType: material.mimeType } : {}),
    ...(material.downloadUrl !== undefined ? { downloadUrl: material.downloadUrl } : {}),
  };
}

function alreadyListed(href: string, listed: readonly IWorkPackLink[]): boolean {
  return listed.some((link) => isSameNormalizedUrl(link.href, href));
}

function kindForHref(href: string, materials: readonly ICourseMaterial[]): WorkPackLinkKind {
  const match = materials.find((m) => m.url != null && isSameNormalizedUrl(m.url, href));
  if (match?.linkAccessibility === 'authenticated') return 'school-login';
  if (isSchoolLoginHost(href)) return 'school-login';
  if (isInteractiveHomeworkHost(href)) return 'needs-internet';
  if (match?.linkAccessibility === 'public') return 'external';
  return 'external';
}

function lmsLabel(href: string): string {
  const lower = href.toLowerCase();
  if (lower.includes('instructure') || lower.includes('canvas')) return 'View in Canvas';
  return 'View on school portal';
}

function toMoreItem(material: ICourseMaterial): IWorkPackMoreItem {
  const asset = toAsset(material);
  if (asset) return { title: material.title, asset };
  if (material.url != null && material.url !== '') {
    return { title: material.title, href: material.url };
  }
  return { title: material.title };
}

function assignmentFallbackLinks(
  forAssignment: readonly ICourseMaterial[],
  primary: IWorkPackAsset | null
): IWorkPackLink[] {
  const links: IWorkPackLink[] = [];
  for (const material of forAssignment) {
    if (material.extractedText != null && material.extractedText !== '') continue;
    const asset = toAsset(material);
    if (primary && asset && asset.assetId === primary.assetId) continue;
    const href = material.url ?? material.downloadUrl;
    if (href == null || href === '') continue;
    if (alreadyListed(href, links)) continue;
    links.push({
      label: material.title,
      href,
      kind: kindForHref(href, forAssignment),
    });
  }
  return links;
}

/**
 * Pure work-pack composer. Hosted file first; LMS is last-resort fallback.
 * Course extras stay in moreFromCourse.
 */
export class WorkPack implements IWorkPack {
  private readonly _source: IWorkPackSource;

  constructor(source: IWorkPackSource) {
    this._source = source;
  }

  public async load(
    session: IStudentSession,
    assignmentExternalId: string
  ): Promise<IWorkPackView> {
    const assignment = await this._source.loadAssignment(assignmentExternalId);
    const materialsRes = await this._source.loadMaterials(assignmentExternalId);
    const { forAssignment, courseMaterials } = partitionMaterials(
      materialsRes,
      assignmentExternalId
    );

    let primaryAsset: IWorkPackAsset | null = null;
    for (const material of forAssignment) {
      const asset = toAsset(material);
      if (asset) {
        primaryAsset = asset;
        break;
      }
    }

    const capturedPages = forAssignment.flatMap((m) => {
      const text = m.extractedText;
      if (text === undefined || text === '') return [];
      return [
        {
          title: m.title,
          text,
          ...(m.url != null && m.url !== '' ? { href: m.url } : {}),
        },
      ];
    });

    const allMaterials = materialsRes.courses.flatMap((c) => c.materials);
    const needsSchoolLogin: IWorkPackLink[] = assignmentFallbackLinks(forAssignment, primaryAsset);

    const html = assignment.descriptionHtml ?? '';
    for (const extracted of extractDescriptionLinks(html)) {
      if (alreadyListed(extracted.href, needsSchoolLogin)) continue;
      if (
        capturedPages.some(
          (p) => p.href !== undefined && isSameNormalizedUrl(p.href, extracted.href)
        )
      ) {
        continue;
      }
      if (
        primaryAsset?.downloadUrl &&
        isSameNormalizedUrl(extracted.href, primaryAsset.downloadUrl)
      ) {
        continue;
      }
      needsSchoolLogin.push({
        label: extracted.text,
        href: extracted.href,
        kind: kindForHref(extracted.href, allMaterials),
      });
    }

    if (assignment.lmsUrl != null && assignment.lmsUrl !== '') {
      if (!alreadyListed(assignment.lmsUrl, needsSchoolLogin)) {
        needsSchoolLogin.push({
          label: lmsLabel(assignment.lmsUrl),
          href: assignment.lmsUrl,
          kind: 'school-login',
        });
      }
    }

    const stripped = html === '' ? '' : stripHtmlToText(html);
    const view: IWorkPackView = {
      title: assignment.title,
      courseName: assignment.courseName,
      humanStatus: humanAssignmentStatus(assignment.status),
      instructionsText: stripped !== '' ? stripped : 'No instructions from the teacher yet.',
      primaryAsset,
      capturedPages,
      needsSchoolLogin,
      moreFromCourse: courseMaterials.map((m) => toMoreItem(m)),
      ...(assignment.dueAt !== undefined ? { dueAt: assignment.dueAt } : {}),
    };
    assertNoGradeLeak(view, session.showGrades);
    return view;
  }
}
