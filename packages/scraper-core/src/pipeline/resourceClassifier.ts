/**
 * Pure resource classifier for the offline asset pipeline.
 *
 * Consumed by: CliAssetHost, WebViewAssetHost, and any future IAssetHost
 * implementation. No network calls here — the caller probes Content-Type
 * via HEAD before calling classifyResource when needed.
 *
 * Capture order (per CLIENT_SCRAPER_SPEC §12.2 and CLASS_OFFLINE_PACK §3):
 *   1. rehost   — file that can be downloaded and rehosted on the CDN
 *   2. extractText — accessible HTML; read text, store as extractedText
 *   3. leaveLink — authenticated portal page; mark linkAccessibility: authenticated
 */

export type ResourceAction = 'rehost' | 'extractText' | 'leaveLink';

/**
 * Portal host patterns that require authentication and cannot be publicly
 * fetched. Links to these hosts without a file download path → leaveLink.
 */
const PORTAL_HOST_PATTERNS: RegExp[] = [
  /\.instructure\.com$/i,
  /canvas\./i,
  /skyward\.iscorp\.com/i,
  /\.aeries\.com/i,
  /\.powerschool\.com/i,
  /\.frontlineeducation\.com/i,
  /\.infinitecampus\.com/i,
];

/**
 * URL path patterns that indicate a native download endpoint on portal hosts.
 * These can be rehosted even though they are on a portal host.
 */
const PORTAL_DOWNLOAD_PATH_PATTERNS: RegExp[] = [
  /\/files\/\d+\/download/i,
  /[?&]download_frd=1/i,
  /\/export\/(pdf|docx|xlsx|pptx)/i,
];

/**
 * Content-Type prefixes that indicate a binary file we can rehost directly.
 */
const REHOST_CONTENT_TYPE_PREFIXES: string[] = [
  'application/pdf',
  'image/',
  'video/',
  'audio/',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'application/vnd.oasis',
];

/**
 * Record `type` values whose content is always a downloadable file,
 * regardless of whether the URL looks like a portal page.
 */
const BINARY_RECORD_TYPES = new Set([
  'document',
  'presentation',
  'video',
  'handout',
  'rubric',
  'study_guide',
]);

function isPortalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return PORTAL_HOST_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

function isPortalDownloadPath(url: string): boolean {
  return PORTAL_DOWNLOAD_PATH_PATTERNS.some((p) => p.test(url));
}

function isRehostContentType(contentType: string | undefined): boolean {
  if (contentType === undefined || contentType === '') return false;
  const lower = contentType.toLowerCase();
  return REHOST_CONTENT_TYPE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export interface IClassifyResourceParams {
  /** Full URL of the resource. Empty string → leaveLink. */
  readonly url: string;
  /**
   * Content-Type from a HEAD/GET response, if the caller has already probed.
   * If not provided, the classifier relies on `type` and URL patterns.
   */
  readonly contentType?: string;
  /**
   * The op record `type` field (e.g. 'document', 'link', 'video', 'other').
   */
  readonly type?: string;
}

/**
 * Classify a portal resource to determine how the asset pipeline should handle it.
 *
 * Returns:
 * - `'rehost'`      — download with portal session, upload to CDN, rewrite URL
 * - `'extractText'` — fetch page text, store as extractedText; keep as type: link
 * - `'leaveLink'`   — portal-authenticated page with no export; set linkAccessibility: authenticated
 */
export function classifyResource(params: IClassifyResourceParams): ResourceAction {
  const { url, contentType, type } = params;

  // Empty URL — cannot act on it
  if (!url) return 'leaveLink';

  // Step 1: Record type is explicitly a binary/downloadable asset type
  if (type !== undefined && BINARY_RECORD_TYPES.has(type)) {
    return 'rehost';
  }

  // Step 2: Content-Type from a HEAD probe reveals a binary file
  if (isRehostContentType(contentType)) {
    return 'rehost';
  }

  // Step 3: Link type — decide based on host + path + content-type
  // Portal host: only rehost if the URL is a download endpoint
  if (isPortalHost(url)) {
    if (isPortalDownloadPath(url)) {
      return 'rehost';
    }
    // Portal page — requires authentication; cannot publicly fetch
    return 'leaveLink';
  }

  // Non-portal URL: if content-type indicates HTML or text, extract text
  if (contentType !== undefined) {
    const lower = contentType.toLowerCase();
    if (lower.startsWith('text/html') || lower.startsWith('text/plain')) {
      return 'extractText';
    }
  }

  // No content-type probe and not a portal host:
  // type 'link' or 'other' → assume accessible public page
  if (type === 'link' || type === 'other' || type === undefined) {
    return 'extractText';
  }

  // Fallback
  return 'leaveLink';
}
