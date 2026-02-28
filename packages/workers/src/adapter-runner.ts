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
import type { AdapterRunnerFn } from '@scholaracle/agents';

export function createAdapterRunner(_db: Db): AdapterRunnerFn {
  return async (
    provider: string,
    _adapterId: string,
    credentials: Record<string, string>,
    baseUrl: string,
    runId: string
  ) => {
    console.log(`[AdapterRunner] run=${runId} provider=${provider} url=${baseUrl}`);

    try {
      switch (provider) {
        // -----------------------------------------------------------------
        // Canvas — API token or browser/SSO
        // -----------------------------------------------------------------
        case 'canvas': {
          if (credentials['accessToken']) {
            return await runCanvasApi(baseUrl, credentials['accessToken'], runId);
          }
          if (credentials['googleEmail'] && credentials['googlePassword']) {
            return await runCanvasBrowser(
              baseUrl,
              credentials['googleEmail'],
              credentials['googlePassword'],
              runId
            );
          }
          if (credentials['username'] && credentials['password']) {
            return await runCanvasBrowser(
              baseUrl,
              credentials['username'],
              credentials['password'],
              runId
            );
          }
          return {
            success: false,
            summary: {},
            error: 'Canvas requires accessToken or googleEmail+googlePassword',
          };
        }

        // -----------------------------------------------------------------
        // Skyward — always browser-based
        // -----------------------------------------------------------------
        case 'skyward': {
          const username = credentials['username'] ?? '';
          const password = credentials['password'] ?? '';
          if (!username || !password) {
            return { success: false, summary: {}, error: 'Skyward requires username and password' };
          }
          return await runSkywardBrowser(baseUrl, username, password, runId);
        }

        // -----------------------------------------------------------------
        // Google Classroom — API token
        // -----------------------------------------------------------------
        case 'google-classroom': {
          const token = credentials['accessToken'] ?? '';
          if (!token) {
            return {
              success: false,
              summary: {},
              error: 'Google Classroom requires an OAuth access token',
            };
          }
          return await runGoogleClassroomApi(token, runId);
        }

        // -----------------------------------------------------------------
        // OneRoster — API
        // -----------------------------------------------------------------
        case 'oneroster': {
          return await runOneRosterApi(baseUrl, credentials, runId);
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
 * caller (SyncWorker) is responsible for submitting them to the ingest API.
 */
async function runCanvasApi(
  baseUrl: string,
  token: string,
  runId: string
): Promise<{ success: boolean; summary: Record<string, number>; error?: string }> {
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
    const sourceId = process.env['SOURCE_ID'] ?? runId;
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
    return { success: true, summary: { courses, assignments, grades, materials } };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Canvas browser (Google SSO)
// ---------------------------------------------------------------------------

async function runCanvasBrowser(
  baseUrl: string,
  email: string,
  password: string,
  runId: string
): Promise<{ success: boolean; summary: Record<string, number>; error?: string }> {
  try {
    const canvasHarnessPath = '@scholaracle/connector/dist/harness/canvas-browser-scrape';
    const canvasMod = (await import(canvasHarnessPath)) as {
      scrapeCanvasViaBrowser: (
        b: string,
        e: string,
        p: string
      ) => Promise<{
        courses: Array<{ assignments: { length: number }; files: { length: number } }>;
      }>;
    };
    const result = await canvasMod.scrapeCanvasViaBrowser(baseUrl, email, password);

    const courses = result.courses.length;
    const assignments = result.courses.reduce(
      (s: number, c: { assignments: { length: number }; files: { length: number } }) =>
        s + c.assignments.length,
      0
    );
    const files = result.courses.reduce(
      (s: number, c: { assignments: { length: number }; files: { length: number } }) =>
        s + c.files.length,
      0
    );

    console.log(
      `[AdapterRunner] Canvas browser (${runId}): ${courses} courses, ${assignments} assignments, ${files} files`
    );
    return { success: true, summary: { courses, assignments, files } };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Skyward browser
// ---------------------------------------------------------------------------

async function runSkywardBrowser(
  baseUrl: string,
  username: string,
  password: string,
  runId: string
): Promise<{ success: boolean; summary: Record<string, number>; error?: string }> {
  try {
    const skywardHarnessPath = '@scholaracle/connector/dist/harness/skyward-browser-scrape';
    const skywardMod = (await import(skywardHarnessPath)) as {
      scrapeSkywardComplete: (
        b: string,
        u: string,
        p: string
      ) => Promise<{
        courses: { length: number };
        missingAssignments: { length: number };
        attendance: { length: number };
      }>;
    };
    const result = await skywardMod.scrapeSkywardComplete(baseUrl, username, password);

    const courses = result.courses.length;
    const assignments = result.missingAssignments.length;
    const attendance = result.attendance.length;

    console.log(
      `[AdapterRunner] Skyward browser (${runId}): ${courses} courses, ${assignments} missing, ${attendance} attendance`
    );
    return { success: true, summary: { courses, assignments, attendance } };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Google Classroom API
// ---------------------------------------------------------------------------

async function runGoogleClassroomApi(
  token: string,
  runId: string
): Promise<{ success: boolean; summary: Record<string, number>; error?: string }> {
  try {
    const { GoogleClassroomAdapter } = await import('@scholaracle/connector');
    const adapter = new GoogleClassroomAdapter();
    await adapter.authenticate({ baseUrl: 'https://classroom.googleapis.com', accessToken: token });

    const envelope = await adapter.fetchEnvelope({
      runId,
      sourceId: runId,
      displayName: 'Google Classroom',
    });

    const courses = envelope.ops.filter((o: { entity: string }) => o.entity === 'course').length;
    const assignments = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'assignment'
    ).length;

    return { success: true, summary: { courses, assignments } };
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
  runId: string
): Promise<{ success: boolean; summary: Record<string, number>; error?: string }> {
  try {
    const { OneRosterAdapter } = await import('@scholaracle/connector');
    const adapter = new OneRosterAdapter();
    await adapter.authenticate({
      baseUrl,
      clientId: credentials['clientId'],
      clientSecret: credentials['clientSecret'],
      accessToken: credentials['accessToken'],
    });

    const envelope = await adapter.fetchEnvelope({
      runId,
      sourceId: runId,
      displayName: 'OneRoster',
      portalBaseUrl: baseUrl,
    });

    const courses = envelope.ops.filter((o: { entity: string }) => o.entity === 'course').length;
    const assignments = envelope.ops.filter(
      (o: { entity: string }) => o.entity === 'assignment'
    ).length;

    return { success: true, summary: { courses, assignments } };
  } catch (err) {
    return { success: false, summary: {}, error: (err as Error).message };
  }
}
