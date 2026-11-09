import { COOKIE_STRICT } from './config';

export interface ICspState {
  readonly sendCspHeader: boolean;
  readonly setStrictCookie: boolean;
  readonly setCookies: string[];
}

export function buildCspState(search: string, jar: Record<string, string>): ICspState {
  const setCookies: string[] = [];
  const qs = new URLSearchParams(search);
  if (qs.get('csp') === 'strict') {
    setCookies.push(`${COOKIE_STRICT}=1; Path=/; HttpOnly; SameSite=Lax`);
  }
  const sendCspHeader =
    process.env['FAKE_PORTAL_STRICT_CSP'] === '1' || qs.get('csp') === 'strict' || jar[COOKIE_STRICT] === '1';
  return { sendCspHeader, setStrictCookie: qs.get('csp') === 'strict', setCookies };
}
