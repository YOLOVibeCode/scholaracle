/**
 * Local + backend identity for the login/settings stamp.
 *
 * The marketing version (1.0.0) does not change between TestFlight builds.
 * The native build number does (39, 40, …). After expo-updates is in the
 * binary, an OTA can change JS without bumping the build — that shows up as
 * `ota <updateId>`.
 *
 * Backend identity comes from GET /api/health/version on the API this binary
 * is compiled to hit (EXPO_PUBLIC_API_URL). That is the Railway git SHA, not
 * the app's git SHA.
 *
 * Do not use the URL API — RN's polyfill is http-only. Host extraction uses
 * extractHostname from urlNormalize.
 */

import { extractHostname } from '../utils/urlNormalize';

export const DEFAULT_API_URL = 'https://api.scholarmancy.com';

export interface ILocalStamp {
  readonly version: string;
  readonly build: string;
  readonly channel: string | null;
  readonly updateId: string | null;
  readonly apiUrl: string;
}

export interface IBackendStamp {
  readonly ok: boolean;
  readonly commit: string;
  readonly branch: string;
  readonly builtAt: string | null;
}

export interface IEnvSlice {
  readonly appVersion: string | null;
  readonly nativeBuild: string | null;
  readonly channel: string | null;
  readonly updateId: string | null;
  readonly apiUrl: string;
}

export function resolveApiBaseUrl(explicit?: string): string {
  const fromEnv = explicit ?? process.env['EXPO_PUBLIC_API_URL'] ?? DEFAULT_API_URL;
  return fromEnv.replace(/\/+$/, '') || DEFAULT_API_URL;
}

export function localStampFromEnv(env: IEnvSlice): ILocalStamp {
  return {
    version: env.appVersion && env.appVersion.length > 0 ? env.appVersion : '?',
    build: env.nativeBuild && env.nativeBuild.length > 0 ? env.nativeBuild : '?',
    channel: env.channel,
    updateId: env.updateId,
    apiUrl: resolveApiBaseUrl(env.apiUrl),
  };
}

export function shortId(value: string): string {
  if (!value || value === 'unknown') return value || 'unknown';
  return value.slice(0, 7);
}

/** Compact UTC clock from an ISO timestamp: `2026-08-13 15:04 UTC`. */
export function formatBuiltAt(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!match || !match[1] || !match[2]) return iso;
  return `${match[1]} ${match[2]} UTC`;
}

export function formatAppLine(stamp: ILocalStamp): string {
  const channel = stamp.channel ? ` · ${stamp.channel}` : '';
  const ota = stamp.updateId ? ` · ota ${shortId(stamp.updateId)}` : '';
  return `App ${stamp.version} (${stamp.build})${channel}${ota}`;
}

export function formatApiLine(stamp: ILocalStamp, backend: IBackendStamp | null): string {
  const host = extractHostname(stamp.apiUrl) || stamp.apiUrl;
  if (backend === null) return `API ${host} · …`;
  if (!backend.ok) return `API ${host} · unreachable`;
  const when = backend.builtAt ? ` · ${formatBuiltAt(backend.builtAt)}` : '';
  return `API ${host} · ${shortId(backend.commit)} · ${backend.branch}${when}`;
}

function readStringField(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}

export async function fetchBackendStamp(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<IBackendStamp> {
  const unreachable: IBackendStamp = {
    ok: false,
    commit: 'unknown',
    branch: 'unknown',
    builtAt: null,
  };
  try {
    const res = await fetchImpl(`${resolveApiBaseUrl(apiUrl)}/api/health/version`);
    if (!res.ok) return unreachable;
    const body = (await res.json()) as {
      commit?: unknown;
      branch?: unknown;
      builtAt?: unknown;
    };
    const commit = readStringField(body.commit) ?? 'unknown';
    const branch = readStringField(body.branch) ?? 'unknown';
    return { ok: true, commit, branch, builtAt: readStringField(body.builtAt) };
  } catch {
    return unreachable;
  }
}
