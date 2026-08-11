/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Server-side adapter runner.
 *
 * Google Classroom and OneRoster remain server-side (OAuth/REST).
 * Canvas, Skyward, and Aeries are client-side only (mobile app / browser extension).
 */

import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type { AdapterRunnerFn, IAdapterRunnerOptions } from '@scholaracle/agents';
import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from './logger';

/**
 * Get Google access token, refreshing if needed.
 */
async function getGoogleAccessToken(credentials: Record<string, string>): Promise<string> {
  let accessToken = credentials['accessToken'] ?? '';
  const refreshToken = credentials['refreshToken'] ?? '';
  if (refreshToken) {
    const clientId = process.env['GOOGLE_CLASSROOM_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLASSROOM_CLIENT_SECRET'];
    if (clientId && clientSecret) {
      const refreshed = await refreshGoogleToken(clientId, clientSecret, refreshToken);
      if (refreshed) accessToken = refreshed;
    }
  }
  return accessToken;
}

/** Create the adapter runner (no DB / Playwright dependency). */
export function createAdapterRunner(): AdapterRunnerFn {
  return async (
    provider: string,
    _adapterId: string,
    credentials: Record<string, string>,
    baseUrl: string,
    runId: string,
    options?: IAdapterRunnerOptions
  ) => {
    logger.info({ runId, provider, baseUrl, job: 'adapter-runner' }, 'adapter run started');

    try {
      switch (provider) {
        case 'canvas':
        case 'skyward':
        case 'aeries': {
          logger.info(
            { runId, provider, job: 'adapter-runner' },
            'skipped - client-side sync only'
          );
          return {
            success: false,
            summary: {},
            error: `${provider} sync requires the Scholaracle mobile app or browser extension. Server-side Playwright sync has been retired for this provider.`,
          };
        }

        case 'google-classroom': {
          const accessToken = await getGoogleAccessToken(credentials);
          if (!accessToken) {
            return {
              success: false,
              summary: {},
              error: 'Google Classroom requires an OAuth access token',
            };
          }
          return await runGoogleClassroomApi(accessToken, runId, options);
        }

        case 'oneroster': {
          return await runOneRosterApi(baseUrl, credentials, runId, options);
        }

        default:
          return { success: false, summary: {}, error: `Unknown provider: ${provider}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, runId, provider, job: 'adapter-runner' }, 'adapter run failed');
      getErrorReporter().captureException(err, { runId, provider, job: 'adapter-runner' });
      return { success: false, summary: {}, error: msg };
    }
  };
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function refreshGoogleToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    logger.warn({ err, job: 'adapter-runner' }, 'google token refresh failed');
    return null;
  }
}

async function runGoogleClassroomApi(
  token: string,
  runId: string,
  options?: IAdapterRunnerOptions
): Promise<{
  success: boolean;
  summary: Record<string, number>;
  error?: string;
  envelope?: ISlcIngestEnvelopeV1;
}> {
  try {
    const { GoogleClassroomAdapter } = await import('@scholaracle/connector');
    const adapter = new GoogleClassroomAdapter();
    await adapter.authenticate({
      baseUrl: 'https://classroom.googleapis.com',
      accessToken: token,
    });

    const sourceId = options?.sourceId ?? runId;
    const displayName = options?.displayName ?? 'Google Classroom';
    const envelope = await adapter.fetchEnvelope({ runId, sourceId, displayName });

    const courses = envelope.ops.filter((o: { entity: string }) => o.entity === 'course').length;
    const assignments = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'assignment'
    ).length;

    return { success: true, summary: { courses, assignments }, envelope };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}

async function runOneRosterApi(
  baseUrl: string,
  credentials: Record<string, string>,
  runId: string,
  options?: IAdapterRunnerOptions
): Promise<{
  success: boolean;
  summary: Record<string, number>;
  error?: string;
  envelope?: ISlcIngestEnvelopeV1;
}> {
  try {
    const { OneRosterAdapter } = await import('@scholaracle/connector');
    const adapter = new OneRosterAdapter();
    await adapter.authenticate({
      baseUrl,
      clientId: credentials['clientId'],
      clientSecret: credentials['clientSecret'],
      accessToken: credentials['accessToken'],
    });

    const sourceId = options?.sourceId ?? runId;
    const displayName = options?.displayName ?? 'OneRoster';
    const envelope = await adapter.fetchEnvelope({
      runId,
      sourceId,
      displayName,
      portalBaseUrl: baseUrl,
    });

    const courses = envelope.ops.filter((o: { entity: string }) => o.entity === 'course').length;
    const assignments = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'assignment'
    ).length;

    return { success: true, summary: { courses, assignments }, envelope };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}
