/**
 * Pure string-based URL helpers.
 *
 * react-native's URL polyfill only understands http(s), so all host work
 * here is plain string parsing. No `URL` API.
 */

interface ISchemeSplit {
  readonly scheme: string;
  readonly rest: string;
}

function splitScheme(url: string): ISchemeSplit | null {
  const idx = url.indexOf('://');
  if (idx <= 0) return null;
  return { scheme: url.slice(0, idx), rest: url.slice(idx + 3) };
}

function endOfAuthority(rest: string): number {
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest[i];
    if (ch === '/' || ch === '?' || ch === '#') return i;
  }
  return rest.length;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}

export function normalizeUrl(url: string): string {
  let out = url.trim();
  const parts = splitScheme(out);
  if (parts) {
    const authorityEnd = endOfAuthority(parts.rest);
    const authority = parts.rest.slice(0, authorityEnd);
    const tail = parts.rest.slice(authorityEnd);
    const atIdx = authority.lastIndexOf('@');
    const creds = atIdx === -1 ? '' : authority.slice(0, atIdx + 1);
    const hostPort = atIdx === -1 ? authority : authority.slice(atIdx + 1);
    out = `${parts.scheme.toLowerCase()}://${creds}${hostPort.toLowerCase()}${tail}`;
  }
  return stripTrailingSlashes(out);
}

export function extractHostname(url: string): string {
  const parts = splitScheme(url.trim());
  if (!parts) return '';
  const authority = parts.rest.slice(0, endOfAuthority(parts.rest));
  const atIdx = authority.lastIndexOf('@');
  const hostPort = atIdx === -1 ? authority : authority.slice(atIdx + 1);
  const colonIdx = hostPort.indexOf(':');
  const host = colonIdx === -1 ? hostPort : hostPort.slice(0, colonIdx);
  return host.toLowerCase();
}

export function isSameNormalizedUrl(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

const SCHOOL_HOST_SUFFIXES = [
  'instructure.com',
  'canvaslms.com',
  'skyward.com',
  'powerschool.com',
  'schoology.com',
] as const;

/** Keep in sync with scraper-core resourceClassifier INTERACTIVE_HOST_PATTERNS. */
const INTERACTIVE_HOST_SUFFIXES = [
  'khanacademy.org',
  'desmos.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'nearpod.com',
  'kahoot.com',
  'quizizz.com',
  'ixl.com',
] as const;

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isSchoolLoginHost(href: string): boolean {
  const host = extractHostname(href);
  if (host === '') return false;
  if (host === 'classroom.google.com') return true;
  return SCHOOL_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(host, suffix));
}

export function isInteractiveHomeworkHost(href: string): boolean {
  const host = extractHostname(href);
  if (host === '') return false;
  return INTERACTIVE_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(host, suffix));
}
