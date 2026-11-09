import { COOKIE_AERIES_STU, COOKIE_AUTH } from './config';

export type CookieJar = Record<string, string>;

export function parseCookieHeader(header: string | undefined): CookieJar {
  const out: CookieJar = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function isAuthorized(jar: CookieJar): boolean {
  return jar[COOKIE_AUTH] === '1';
}

export function readAeriesStudent(jar: CookieJar): 'A' | 'B' {
  return jar[COOKIE_AERIES_STU] === 'B' ? 'B' : 'A';
}
