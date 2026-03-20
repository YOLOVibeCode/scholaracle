/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Server-side adapter runner.
 *
 * This is the bridge between the SyncWorker and the actual scraping code.
 * For browser-based platforms (Canvas, Skyward, Aeries), it uses the
 * scholaracle-scraper library (Playwright-based scrapers).
 * For API-based platforms (Google Classroom, OneRoster), it uses the
 * connector's REST adapters directly.
 */

import type { Db } from 'mongodb';
import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type { AdapterRunnerFn, IAdapterRunnerOptions } from '@scholaracle/agents';
import type { IScraperConfig } from 'scholaracle-scraper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScraperConfig(
  provider: string,
  adapterId: string,
  credentials: Record<string, string>,
  baseUrl: string,
  sourceId: string,
  options?: IAdapterRunnerOptions
): IScraperConfig {
  return {
    credentials: {
      baseUrl,
      username: credentials['username'] ?? '',
      password: credentials['password'] ?? '',
      accessToken: credentials['accessToken'],
      loginMethod:
        (credentials['loginMethod'] as IScraperConfig['credentials']['loginMethod']) ?? undefined,
      studentNameHint: credentials['studentNameHint'],
    },
    studentName: credentials['studentName'] ?? options?.studentName ?? '',
    studentExternalId: credentials['studentExternalId'] || options?.studentId || sourceId,
    institutionExternalId: new URL(baseUrl || 'https://unknown').hostname,
    sourceId,
    provider,
    adapterId,
    options: { headless: true },
  };
}

function envelopeToResult(envelope: ISlcIngestEnvelopeV1): {
  success: boolean;
  summary: Record<string, number>;
  envelope: ISlcIngestEnvelopeV1;
} {
  const summary: Record<string, number> = {};
  for (const op of envelope.ops) {
    summary[op.entity] = (summary[op.entity] ?? 0) + 1;
  }
  return { success: true, summary, envelope };
}

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

// ---------------------------------------------------------------------------
// Main runner factory
// ---------------------------------------------------------------------------

export function createAdapterRunner(db: Db): AdapterRunnerFn {
  return async (
    provider: string,
    adapterId: string,
    credentials: Record<string, string>,
    baseUrl: string,
    runId: string,
    options?: IAdapterRunnerOptions
  ) => {
    console.log(`[AdapterRunner] run=${runId} provider=${provider} url=${baseUrl}`);
    const sourceId = options?.sourceId ?? runId;

    try {
      switch (provider) {
        // -----------------------------------------------------------------
        // Canvas — Playwright browser scraper
        // -----------------------------------------------------------------
        case 'canvas': {
          const { CanvasScraper } = await import('scholaracle-scraper');
          const scraper = new CanvasScraper();
          const config = buildScraperConfig(
            provider,
            adapterId,
            credentials,
            baseUrl,
            sourceId,
            options
          );
          const envelope = await scraper.run(config);
          const result = envelopeToResult(envelope);
          console.log(
            `[AdapterRunner] Canvas scraper (${runId}): ${envelope.ops.length} total ops`
          );
          return result;
        }

        // -----------------------------------------------------------------
        // Skyward — Playwright browser scraper
        // -----------------------------------------------------------------
        case 'skyward': {
          const username = credentials['username'] ?? '';
          const password = credentials['password'] ?? '';
          if (!username || !password) {
            return { success: false, summary: {}, error: 'Skyward requires username and password' };
          }
          const { SkywardScraper } = await import('scholaracle-scraper');
          const { MongoStrategyStore } = await import('@scholaracle/connector');
          const scraper = new SkywardScraper();
          scraper.strategyStore = new MongoStrategyStore(db);
          const config = buildScraperConfig(
            provider,
            adapterId,
            credentials,
            baseUrl,
            sourceId,
            options
          );
          const envelope = await scraper.run(config);
          const result = envelopeToResult(envelope);
          console.log(
            `[AdapterRunner] Skyward scraper (${runId}): ${envelope.ops.length} total ops`
          );
          return result;
        }

        // -----------------------------------------------------------------
        // Aeries — Playwright browser scraper
        // -----------------------------------------------------------------
        case 'aeries': {
          const { AeriesScraper } = await import('scholaracle-scraper');
          const scraper = new AeriesScraper();
          const config = buildScraperConfig(
            provider,
            adapterId,
            credentials,
            baseUrl,
            sourceId,
            options
          );
          const envelope = await scraper.run(config);
          const result = envelopeToResult(envelope);
          console.log(
            `[AdapterRunner] Aeries scraper (${runId}): ${envelope.ops.length} total ops`
          );
          return result;
        }

        // -----------------------------------------------------------------
        // Google Classroom — OAuth token (API-based, uses connector adapter)
        // -----------------------------------------------------------------
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

        // -----------------------------------------------------------------
        // OneRoster — API (uses connector adapter)
        // -----------------------------------------------------------------
        case 'oneroster': {
          return await runOneRosterApi(baseUrl, credentials, runId, options);
        }

        default:
          return { success: false, summary: {}, error: `Unknown provider: ${provider}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AdapterRunner] run=${runId} FAILED: ${msg}`);
      return { success: false, summary: {}, error: msg };
    }
  };
}

// ---------------------------------------------------------------------------
// Google OAuth token refresh
// ---------------------------------------------------------------------------

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
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Classroom API (kept — has API access)
// ---------------------------------------------------------------------------

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
    await adapter.authenticate({ baseUrl: 'https://classroom.googleapis.com', accessToken: token });

    const sourceId = options?.sourceId ?? runId;
    const displayName = options?.displayName ?? 'Google Classroom';
    const envelope = await adapter.fetchEnvelope({
      runId,
      sourceId,
      displayName,
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

// ---------------------------------------------------------------------------
// OneRoster API (kept — has API access)
// ---------------------------------------------------------------------------

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
