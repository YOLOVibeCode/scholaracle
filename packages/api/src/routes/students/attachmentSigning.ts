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

/**
 * Base URL for SIGNED ASSET LINKS — must be the API's own origin, never the
 * web app's. `config.baseUrl` is the web origin (invite/reset links) and in
 * production stored asset URLs are absolute on the API host, so signing
 * against the web origin produces zero matches and wrong-host links.
 * Railway injects RAILWAY_PUBLIC_DOMAIN per environment, so this needs no
 * per-env configuration; API_BASE_URL is an explicit override.
 */
export function resolveApiBaseUrl(configBaseUrl: string | undefined): string {
  const explicit = process.env['API_BASE_URL'];
  if (explicit) return explicit;
  const railwayDomain = process.env['RAILWAY_PUBLIC_DOMAIN'];
  if (railwayDomain) return `https://${railwayDomain}`;
  const assetBase = process.env['ASSET_BASE_URL'];
  if (assetBase) return assetBase;
  const port = process.env['PORT'];
  const webLocal =
    configBaseUrl === undefined ||
    configBaseUrl.includes('localhost:2800') ||
    configBaseUrl.includes('127.0.0.1:2800');
  if (webLocal && port !== undefined && port !== '' && port !== '2800') {
    return `http://localhost:${port}`;
  }
  return configBaseUrl ?? '';
}

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
