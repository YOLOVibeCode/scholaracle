/**
 * Deep-link detection and token extraction for magic login links.
 *
 * Handled schemes / paths:
 *   scholarmancy://magic?token=<raw>      ← from /magic web page
 *   scholarmancy://magic/<raw>            ← fallback path form
 *
 * Parsed with plain string operations — NOT the URL API.
 * React Native's URL polyfill only understands http(s), so custom-scheme
 * URLs return '' for host/pathname without throwing. See demoLogin.ts.
 */

const SCHEME_PREFIX = 'scholarmancy:';

/**
 * Returns the raw magic token from a deep-link URL, or null if the URL
 * is not a magic-login link.
 */
export function extractMagicToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith(SCHEME_PREFIX)) return null;

  // Strip scheme + leading slashes  →  e.g. "magic?token=abc" or "magic/abc"
  const rest = trimmed.slice(SCHEME_PREFIX.length).replace(/^\/+/, '');

  if (!rest.toLowerCase().startsWith('magic')) return null;

  const afterMagic = rest.slice('magic'.length); // "?token=abc" or "/abc" or ""

  // Query-string form: ?token=<value>
  const qIndex = afterMagic.indexOf('?');
  if (qIndex !== -1) {
    const query = afterMagic.slice(qIndex + 1);
    for (const part of query.split('&')) {
      const [key, val] = part.split('=');
      if (key?.toLowerCase() === 'token' && val) {
        return decodeURIComponent(val);
      }
    }
  }

  // Path form: /abc
  const slashIndex = afterMagic.indexOf('/');
  if (slashIndex !== -1) {
    const token = afterMagic.slice(slashIndex + 1).replace(/\/+$/, '');
    if (token.length > 0) return token;
  }

  return null;
}
