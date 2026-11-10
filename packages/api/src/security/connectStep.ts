import { isPrivateAddress } from './isPrivateAddress';

export interface IConnectResult {
  readonly ok: boolean;
  readonly httpStatus?: number;
  readonly responseTimeMs?: number;
  readonly sslValid?: boolean;
  readonly error?: string;
}

const CONNECT_TIMEOUT_MS = 15_000;

/** HTTP HEAD reachability check with SSRF guard (no browser). */
export async function connectStep(loginUrl: string): Promise<IConnectResult> {
  const start = Date.now();
  try {
    const url = new URL(loginUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, error: 'URL must be http or https' };
    }
    if (await isPrivateAddress(url.hostname)) {
      return { ok: false, error: 'URL must not target a private or internal address' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    const res = await fetch(loginUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'ScholaracleScraperGenerator/1.0' },
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    if (!res.ok && res.status >= 400) {
      return {
        ok: false,
        httpStatus: res.status,
        responseTimeMs,
        sslValid: true,
        error: `Site returned HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      httpStatus: res.status,
      responseTimeMs,
      sslValid: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const responseTimeMs = Date.now() - start;
    let error = msg;
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      error = 'Could not connect — check the URL and try again';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      error = 'Could not resolve host — check the URL';
    } else if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
      error = 'SSL certificate error — site may be insecure or misconfigured';
    } else if (msg.includes('abort')) {
      error = 'Connection timed out';
    }
    return {
      ok: false,
      responseTimeMs,
      error,
    };
  }
}
