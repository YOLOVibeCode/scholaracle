export const DEMO_USER = 'demo';
export const DEMO_PASS = 'demo';
export const COOKIE_AUTH = 'slc_fp_auth';
export const COOKIE_AERIES_STU = 'slc_fp_aeries_stu';
export const COOKIE_STRICT = 'slc_fp_strict';
export const DEFAULT_PORT = 2855;
export const AERIES_ROOT = '/fake-aeries/student/';
export const SCRIPT_BASE = '/static';

/** Default listen port from env (FAKE_PORTAL_PORT or PORT). */
export function getPort(): number {
  const raw = process.env['FAKE_PORTAL_PORT'] ?? process.env['PORT'];
  if (!raw) return DEFAULT_PORT;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}
