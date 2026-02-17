/**
 * Helpers for live integration tests.
 *
 * These tests hit real APIs and are gated behind environment variables.
 * When the required env vars are missing, the entire describe block is skipped.
 */

export interface ILiveTestEnv {
  readonly available: boolean;
  readonly reason?: string;
}

/**
 * Check if Canvas live test credentials are available.
 */
export function canvasEnv(): ILiveTestEnv & {
  baseUrl: string;
  accessToken: string;
} {
  const baseUrl = process.env['CANVAS_BASE_URL'] ?? '';
  const accessToken = process.env['CANVAS_ACCESS_TOKEN'] ?? '';

  if (!baseUrl || !accessToken) {
    return {
      available: false,
      reason: 'Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN to run Canvas live tests',
      baseUrl: '',
      accessToken: '',
    };
  }
  return { available: true, baseUrl, accessToken };
}

/**
 * Check if Google Classroom live test credentials are available.
 */
export function googleClassroomEnv(): ILiveTestEnv & {
  accessToken: string;
} {
  const accessToken = process.env['GOOGLE_CLASSROOM_ACCESS_TOKEN'] ?? '';

  if (!accessToken) {
    return {
      available: false,
      reason: 'Set GOOGLE_CLASSROOM_ACCESS_TOKEN to run Google Classroom live tests',
      accessToken: '',
    };
  }
  return { available: true, accessToken };
}

/**
 * Check if OneRoster live test credentials are available.
 */
export function oneRosterEnv(): ILiveTestEnv & {
  baseUrl: string;
  accessToken: string;
  clientId: string;
  clientSecret: string;
} {
  const baseUrl = process.env['ONEROSTER_BASE_URL'] ?? '';
  const accessToken = process.env['ONEROSTER_ACCESS_TOKEN'] ?? '';
  const clientId = process.env['ONEROSTER_CLIENT_ID'] ?? '';
  const clientSecret = process.env['ONEROSTER_CLIENT_SECRET'] ?? '';

  if (!baseUrl || (!accessToken && (!clientId || !clientSecret))) {
    return {
      available: false,
      reason:
        'Set ONEROSTER_BASE_URL + ONEROSTER_ACCESS_TOKEN (or ONEROSTER_CLIENT_ID + ONEROSTER_CLIENT_SECRET) to run OneRoster live tests',
      baseUrl: '',
      accessToken: '',
      clientId: '',
      clientSecret: '',
    };
  }
  return { available: true, baseUrl, accessToken, clientId, clientSecret };
}

/**
 * Conditionally run a describe block only if the env check passes.
 * Prints a skip message when credentials are missing.
 */
export function describeIfAvailable(
  env: ILiveTestEnv,
  name: string,
  fn: () => void
): void {
  if (env.available) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (SKIPPED: ${env.reason})`, fn);
  }
}
