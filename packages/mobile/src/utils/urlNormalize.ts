/**
 * Pure string-based URL helpers.
 *
 * react-native's URL polyfill only understands http(s) — `host`/`pathname`
 * return ''/'/' for other schemes and the constructor never throws — so all
 * URL work in the app must be plain string parsing. No `URL` API here.
 */

interface ISchemeSplit {
  readonly scheme: string;
  readonly rest: string;
}

/** Split 'scheme://rest'; null when there is no non-empty scheme + '://'. */
function splitScheme(url: string): ISchemeSplit | null {
  const idx = url.indexOf('://');
  if (idx <= 0) return null;
  return { scheme: url.slice(0, idx), rest: url.slice(idx + 3) };
}

/** Index of the first '/', '?' or '#' in `rest` (end of the authority). */
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

/**
 * Normalize a URL for comparison: trim whitespace, lowercase the scheme and
 * host portions only (path/query case is preserved, credentials are kept
 * as-is), and strip trailing slashes.
 *
 * Inputs without a 'scheme://' prefix are only trimmed and slash-stripped —
 * without a scheme there is no identifiable host portion to lowercase.
 */
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

/**
 * Extract the lowercased hostname from a URL via string parsing:
 * strip 'scheme://', drop optional 'creds@', stop at '/', ':', '?' or '#'.
 *
 * Returns '' when the input is empty or unparseable (no 'scheme://', e.g.
 * 'httpfoo.com'). The port is never part of the result.
 */
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

/** True when both URLs normalize to the same string. */
export function isSameNormalizedUrl(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}
