/**
 * Force-update gate: pure helpers.
 *
 * The API publishes GET /api/health/min-app-version. When `minVersion` is set
 * and this binary is older, the app shows a blocking "Update required" screen.
 * Every failure path (network, bad JSON, unparseable version) FAILS OPEN: a
 * broken gate must never lock people out of the app.
 *
 * No URL API (RN's polyfill is http-only) — string helpers only.
 */

import { resolveApiBaseUrl } from './deployStamp';

export interface IMinVersionPolicy {
  /** Dotted numeric version, or null when no gate is configured. */
  readonly minVersion: string | null;
  /** Optional native build floor, only consulted when versions are equal. */
  readonly minBuild: string | null;
  readonly message: string | null;
  readonly storeUrls: { readonly ios: string | null; readonly android: string | null };
}

export const NO_GATE: IMinVersionPolicy = {
  minVersion: null,
  minBuild: null,
  message: null,
  storeUrls: { ios: null, android: null },
};

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

/** Parse `1.2.3` (a `-beta` / `+meta` suffix is ignored) into numbers, or null. */
export function parseVersion(raw: string | null | undefined): number[] | null {
  if (typeof raw !== 'string') return null;
  const core = raw.trim().split(/[-+]/)[0] ?? '';
  if (!VERSION_PATTERN.test(core)) return null;
  return core.split('.').map((part) => Number(part));
}

/** -1 / 0 / 1, or null when either side cannot be parsed. Missing parts count as 0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

/** True only when we can positively tell this binary is below the floor. */
export function isUpdateRequired(
  currentVersion: string | null | undefined,
  currentBuild: string | null | undefined,
  policy: IMinVersionPolicy
): boolean {
  if (!policy.minVersion || !currentVersion) return false;
  const cmp = compareVersions(currentVersion, policy.minVersion);
  if (cmp === null) return false;
  if (cmp < 0) return true;
  if (cmp > 0 || !policy.minBuild) return false;
  const build = Number(currentBuild);
  const floor = Number(policy.minBuild);
  if (!currentBuild || !Number.isFinite(build) || !Number.isFinite(floor)) return false;
  return build < floor;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Defensive parse of the API body; anything unexpected becomes "no gate". */
export function parsePolicy(body: unknown): IMinVersionPolicy {
  if (typeof body !== 'object' || body === null) return NO_GATE;
  const raw = body as Record<string, unknown>;
  const minVersion = textOrNull(raw['minVersion']);
  if (!minVersion || !parseVersion(minVersion)) return NO_GATE;
  const urls =
    typeof raw['storeUrls'] === 'object' && raw['storeUrls'] !== null
      ? (raw['storeUrls'] as Record<string, unknown>)
      : {};
  return {
    minVersion,
    minBuild: textOrNull(raw['minBuild']),
    message: textOrNull(raw['message']),
    storeUrls: { ios: httpsOrNull(urls['ios']), android: httpsOrNull(urls['android']) },
  };
}

/** Store links must be https; anything else is dropped rather than opened. */
function httpsOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  return text && text.toLowerCase().startsWith('https://') ? text : null;
}

export async function fetchMinVersionPolicy(
  apiUrl?: string,
  fetchImpl: typeof fetch = fetch
): Promise<IMinVersionPolicy> {
  try {
    const res = await fetchImpl(`${resolveApiBaseUrl(apiUrl)}/api/health/min-app-version`);
    if (!res.ok) return NO_GATE;
    return parsePolicy(await res.json());
  } catch {
    return NO_GATE;
  }
}

export function storeUrlFor(
  policy: IMinVersionPolicy,
  platform: 'ios' | 'android' | string
): string | null {
  return platform === 'ios'
    ? policy.storeUrls.ios
    : platform === 'android'
      ? policy.storeUrls.android
      : null;
}
