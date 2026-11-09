import type { ServerResponse } from 'node:http';
import type { ICspState } from './csp';

export function mergeSetCookies(a: string[], b: string[]): string[] {
  return [...a, ...b];
}

export function sendResponse(
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  cspState: ICspState,
  moreCookies: string[] = []
): void {
  const headers: Record<string, string | string[]> = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  };
  if (cspState.sendCspHeader) {
    headers['Content-Security-Policy'] = "default-src 'self'";
  }
  const all = mergeSetCookies(cspState.setCookies, moreCookies);
  if (all.length > 0) headers['Set-Cookie'] = all;
  res.writeHead(status, headers);
  res.end(body);
}

export function redirect302(
  res: ServerResponse,
  location: string,
  cspState: ICspState,
  cookies: string[] = []
): void {
  const headers: Record<string, string | string[]> = { Location: location };
  if (cspState.sendCspHeader) {
    headers['Content-Security-Policy'] = "default-src 'self'";
  }
  const all = mergeSetCookies(cspState.setCookies, cookies);
  if (all.length > 0) headers['Set-Cookie'] = all;
  res.writeHead(302, headers);
  res.end();
}
