/**
 * Deep-link detection for scholarmancy://diag — unlocks and opens the overlay.
 *
 * Parsed with plain string operations, NOT the URL API. React Native's URL
 * polyfill only understands http(s) — host/pathname return '' for custom
 * schemes and the constructor never throws. See demoLogin.ts for precedent.
 */

const SCHEME_PREFIX = 'scholarmancy:';

/** True when the URL should unlock and open the diagnostic overlay. */
export function isDiagDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized.startsWith(SCHEME_PREFIX)) return false;
  // Strip scheme, then any number of leading slashes, then trailing slashes.
  // scholarmancy:diag, scholarmancy://diag, scholarmancy:///diag all match.
  const target = normalized.slice(SCHEME_PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '');
  return target === 'diag';
}
