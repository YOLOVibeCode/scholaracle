/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Server-side adapter runner.
 *
 * This is the bridge between the SyncWorker and the actual adapter code.
 * It creates adapters, runs them, and returns results.
 *
 * For browser-based platforms (Skyward, Canvas with SSO), it uses Playwright.
 * For API-based platforms (Canvas with token, Google Classroom, OneRoster), it uses the adapter directly.
 */

import type { Db } from 'mongodb';
import type { AdapterRunnerFn, IAdapterRunnerOptions } from '@scholaracle/agents';

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

export function createAdapterRunner(db: Db): AdapterRunnerFn {
  return async (
    provider: string,
    _adapterId: string,
    credentials: Record<string, string>,
    baseUrl: string,
    runId: string,
    options?: IAdapterRunnerOptions
  ) => {
    console.log(`[AdapterRunner] run=${runId} provider=${provider} url=${baseUrl}`);

    try {
      switch (provider) {
        // -----------------------------------------------------------------
        // Canvas — API token or browser/SSO
        // -----------------------------------------------------------------
        case 'canvas': {
          if (credentials['accessToken']) {
            return await runCanvasApi(baseUrl, credentials['accessToken'], runId, options);
          }
          return {
            success: false,
            summary: {},
            error:
              'Canvas requires an API access token. Browser login is not supported in this environment.',
          };
        }

        // -----------------------------------------------------------------
        // Skyward — browser-based scraper (Playwright)
        // -----------------------------------------------------------------
        case 'skyward': {
          const username = credentials['username'] ?? '';
          const password = credentials['password'] ?? '';
          if (!username || !password) {
            return { success: false, summary: {}, error: 'Skyward requires username and password' };
          }
          return await runSkywardBrowser(db, baseUrl, username, password, runId, options);
        }

        // -----------------------------------------------------------------
        // Google Classroom — OAuth token (refresh if refreshToken present)
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
        // OneRoster — API
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
// Canvas REST API (token-based)
// ---------------------------------------------------------------------------

/**
 * Two-pass sync: pass 1 fetches metadata + downloads critical/high priority
 * files; pass 2 downloads medium/low. Both passes produce an envelope. The
 * caller (SyncWorker) submits the envelope to the ingest API when configured.
 */
async function runCanvasApi(
  baseUrl: string,
  token: string,
  runId: string,
  options?: IAdapterRunnerOptions
): Promise<{
  success: boolean;
  summary: Record<string, number>;
  error?: string;
  envelope?: import('@scholaracle/contracts').ISlcIngestEnvelopeV1;
}> {
  try {
    const {
      CanvasAdapter,
      AssetDownloader: ASSET_DOWNLOADER_CTOR,
      DEFAULT_MAX_ASSET_DOWNLOAD_BYTES,
    } = await import('@scholaracle/connector');
    const adapter = new CanvasAdapter();
    await adapter.authenticate({ baseUrl, accessToken: token });

    const apiBaseUrl = process.env['API_BASE_URL'];
    const connectorToken = process.env['CONNECTOR_TOKEN'];
    const sourceId = options?.sourceId ?? process.env['SOURCE_ID'] ?? runId;
    const maxSize = parseInt(process.env['MAX_ASSET_DOWNLOAD_SIZE'] ?? '', 10);

    const assetDownloader =
      apiBaseUrl && connectorToken
        ? new ASSET_DOWNLOADER_CTOR({
            apiBaseUrl,
            connectorToken,
            sourceId,
            provider: 'canvas',
            maxSizeBytes: Number.isFinite(maxSize) ? maxSize : DEFAULT_MAX_ASSET_DOWNLOAD_BYTES,
          })
        : undefined;

    const sharedParams = {
      runId,
      sourceId,
      displayName: 'Canvas',
      portalBaseUrl: baseUrl,
      assetDownloader,
      assetDownloadHeaders: { Authorization: `Bearer ${token}` },
    };

    const pass1Envelope = await adapter.fetchEnvelope({
      ...sharedParams,
      assetPriorityFilter: assetDownloader ? ('critical_high_only' as const) : ('all' as const),
    });

    let totalOps = pass1Envelope.ops.length;

    if (assetDownloader) {
      try {
        const pass2Envelope = await adapter.fetchEnvelope({
          ...sharedParams,
          assetPriorityFilter: 'medium_low_only',
        });
        totalOps += pass2Envelope.ops.filter(
          (o: { entity: string }) => o.entity === 'courseMaterial'
        ).length;
      } catch {
        // Pass 2 is best-effort; user already sees data from pass 1.
      }
    }

    const courses = pass1Envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'course'
    ).length;
    const assignments = pass1Envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'assignment'
    ).length;
    const grades = pass1Envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'gradeSnapshot'
    ).length;
    const materials = pass1Envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'courseMaterial'
    ).length;

    console.log(
      `[AdapterRunner] Canvas API: ${courses} courses, ${assignments} assignments, ${grades} grades, ${materials} materials (${totalOps} total ops)`
    );
    return {
      success: true,
      summary: { courses, assignments, grades, materials },
      envelope: pass1Envelope,
    };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Skyward browser (Playwright)
// ---------------------------------------------------------------------------

async function runSkywardBrowser(
  database: Db,
  baseUrl: string,
  username: string,
  password: string,
  runId: string,
  options?: IAdapterRunnerOptions
): Promise<{
  success: boolean;
  summary: Record<string, number>;
  error?: string;
  envelope?: import('@scholaracle/contracts').ISlcIngestEnvelopeV1;
}> {
  try {
    const { SkywardBrowserAdapter, createAiClient, MongoStrategyStore } =
      await import('@scholaracle/connector');
    const aiProvider = process.env['AI_PROVIDER'] as 'openai' | 'anthropic' | 'gemini' | undefined;
    const aiApiKey = process.env['AI_API_KEY'];
    const aiClient =
      aiProvider && aiApiKey && ['openai', 'anthropic', 'gemini'].includes(aiProvider)
        ? createAiClient(aiProvider, aiApiKey)
        : undefined;
    const strategyStore = new MongoStrategyStore(database);
    const adapter = new SkywardBrowserAdapter(undefined, aiClient, strategyStore);
    await adapter.authenticate({ baseUrl, username, password });

    const sourceId = options?.sourceId ?? process.env['SOURCE_ID'] ?? runId;
    const displayName = options?.displayName ?? 'Skyward';
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
    const grades = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'gradeSnapshot'
    ).length;
    const attendance = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'attendanceEvent'
    ).length;

    console.log(
      `[AdapterRunner] Skyward browser (${runId}): ${courses} courses, ${assignments} assignments, ${grades} grades, ${attendance} attendance`
    );
    return {
      success: true,
      summary: { courses, assignments, grades, attendance },
      envelope,
    };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
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
// Google Classroom API
// ---------------------------------------------------------------------------

async function runGoogleClassroomApi(
  token: string,
  runId: string,
  options?: IAdapterRunnerOptions
): Promise<{
  success: boolean;
  summary: Record<string, number>;
  error?: string;
  envelope?: import('@scholaracle/contracts').ISlcIngestEnvelopeV1;
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
// OneRoster API
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
  envelope?: import('@scholaracle/contracts').ISlcIngestEnvelopeV1;
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
