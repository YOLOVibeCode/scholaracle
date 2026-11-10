/**
 * Deep-link detection and token extraction for magic login links.
 *
 * Handled schemes / paths:
 *   scholarmancy://magic?token=<raw>      ← from /magic web page
 *   scholarmancy://magic/<raw>            ← fallback path form
 *   https://scholarmancy.com/magic?token=<raw>
 *                                         ← universal link / Android app link
 *                                           (also www.scholarmancy.com)
 *
 * Parsed with plain string operations — NOT the URL API.
 * React Native's URL polyfill only understands http(s), so custom-scheme
 * URLs return '' for host/pathname without throwing. See demoLogin.ts.
 */

const SCHEME_PREFIX = 'scholarmancy:';
const WEB_PREFIXES = ['https://scholarmancy.com/', 'https://www.scholarmancy.com/'];

/**
 * Path (+ query) after the scheme or the verified web host, with leading
 * slashes stripped (e.g. "magic?token=abc"), or null if the URL is neither.
 */
function appLinkRest(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.startsWith(SCHEME_PREFIX)) return url.slice(SCHEME_PREFIX.length).replace(/^\/+/, '');
  const web = WEB_PREFIXES.find((prefix) => lower.startsWith(prefix));
  return web ? url.slice(web.length).replace(/^\/+/, '') : null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Returns the raw magic token from a deep-link URL, or null if the URL
 * is not a magic-login link.
 */
export function extractMagicToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Strip scheme/host + leading slashes  →  e.g. "magic?token=abc" or "magic/abc"
  const rest = appLinkRest(trimmed);
  if (rest === null) return null;

  if (!rest.toLowerCase().startsWith('magic')) return null;

  const afterMagic = rest.slice('magic'.length); // "?token=abc" or "/abc" or ""

  // Query-string form: ?token=<value>
  const qIndex = afterMagic.indexOf('?');
  if (qIndex !== -1) {
    const query = afterMagic.slice(qIndex + 1);
    for (const part of query.split('&')) {
      const [key, val] = part.split('=');
      if (key?.toLowerCase() === 'token' && val) {
        return safeDecode(val);
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
