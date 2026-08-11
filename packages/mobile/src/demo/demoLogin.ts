/**
 * Demo quick-login via deep link: scholarmancy://demo
 *
 * Signs the device into the public demo account (same credentials the
 * website's "Explore Demo" button uses — they are public by design).
 *
 * IMPORTANT: parsed with plain string operations, NOT the URL API. React
 * Native's URL polyfill only understands http(s) — host/pathname return ''
 * for custom schemes and the constructor never throws — so any URL-based
 * check passes in Node tests while silently failing on device.
 */

export const DEMO_EMAIL = 'demo@scholarmancy.com';
export const DEMO_PASSWORD = 'DemoPass123!'; // public placeholder-grade demo credential, already in the web bundle

const SCHEME_PREFIX = 'scholarmancy:';

/** True when the URL is the demo quick-login deep link. */
export function isDemoDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized.startsWith(SCHEME_PREFIX)) return false;
  // Strip scheme, then any number of leading slashes (scholarmancy:demo,
  // scholarmancy://demo, scholarmancy:///demo all normalize to 'demo'),
  // then trailing slashes.
  const target = normalized.slice(SCHEME_PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '');
  return target === 'demo';
}
