/**
 * Sign grade-payload attachment URLs that point at our own asset server.
 *
 * Attachment URLs come from portal scrapes; the asset-downloader rewrites
 * many of them to `<apiBase>/api/assets/<assetId>` — which requires either
 * an Authorization header or a signature. Mobile/web open these in a plain
 * browser tab, so we attach a signed `downloadUrl` (24h TTL). Raw portal
 * URLs (foreign hosts) pass through untouched — the client renders those
 * with an "opens school portal" hint.
 */

import { signAssetUrl } from '../../services/assets/signedUrl';
import type { ICourseGradeAttachment } from '@scholaracle/contracts';

const ASSET_PATH_PREFIX = '/api/assets/';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Return the assetId when `url` targets OUR asset route: either a relative
 * `/api/assets/<id>` path or an absolute URL whose prefix matches `baseUrl`.
 * Returns null for foreign hosts and unparseable values.
 */
export function extractOwnAssetId(url: string | undefined, baseUrl: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  let path: string | null = null;
  if (trimmed.startsWith(ASSET_PATH_PREFIX)) {
    path = trimmed;
  } else if (baseUrl) {
    const base = stripTrailingSlash(baseUrl);
    if (trimmed.startsWith(`${base}${ASSET_PATH_PREFIX}`)) {
      path = trimmed.slice(base.length);
    }
  }
  if (!path) return null;

  const rest = path.slice(ASSET_PATH_PREFIX.length);
  const assetId = rest.split(/[/?#]/, 1)[0] ?? '';
  return assetId.length > 0 ? assetId : null;
}

/**
 * Add `downloadUrl` to attachments hosted on our asset server. No-op for
 * portal URLs, and for everything when jwtSecret/baseUrl are unavailable.
 */
export function signOwnAssetAttachments(
  attachments: ReadonlyArray<ICourseGradeAttachment> | undefined,
  baseUrl: string,
  jwtSecret: string | undefined
): ICourseGradeAttachment[] | undefined {
  if (!attachments) return undefined;
  if (!jwtSecret || !baseUrl) return [...attachments];

  return attachments.map((attachment) => {
    const assetId = extractOwnAssetId(attachment.url, baseUrl);
    if (!assetId) return attachment;
    return { ...attachment, downloadUrl: signAssetUrl(baseUrl, assetId, jwtSecret) };
  });
}
