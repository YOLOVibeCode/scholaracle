/**
 * Scholaracle API client for the mobile app.
 *
 * Handles JWT auth (access + refresh tokens), connector token minting,
 * and ingest envelope upload.
 */

import * as SecureStore from 'expo-secure-store';
import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';

const ACCESS_TOKEN_KEY = 'slc_access_token';
const REFRESH_TOKEN_KEY = 'slc_refresh_token';
const CONNECTOR_TOKEN_KEY = 'slc_connector_token';

/**
 * Auth response from the Scholarmancy API. Production returns the access
 * token in `token`; `accessToken` is accepted as a legacy/alternate field.
 * `refreshToken` may be rotated on refresh and must be re-persisted.
 */
interface IAuthResponse {
  readonly success?: boolean;
  readonly token?: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly user?: { readonly id: string; readonly email: string; readonly name?: string };
}

export interface IStudentListItem {
  readonly _id: string;
  readonly name: string;
  readonly externalId: string;
  readonly grade?: string;
}

interface IConnectorTokenResponse {
  readonly token: string;
  readonly jti?: string;
  readonly expiresIn?: string;
}

export interface IAssignmentItem {
  readonly _id: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status?: string;
  readonly courseName?: string;
  readonly courseExternalId?: string;
}

export interface IGradeItem {
  readonly _id: string;
  readonly courseExternalId: string;
  readonly asOfDate: string;
  readonly percentGrade?: number;
  readonly letterGrade?: string;
  readonly courseName?: string;
}

export interface ISyncRunItem {
  readonly _id: string;
  readonly provider: string;
  readonly status: string;
  readonly startedAt: string;
  readonly opCount?: number;
}

/**
 * Real API shape: sources use `id`, not `sourceId`.
 * provider + displayName are on the source, not on individual runs.
 */
interface ISourceItem {
  readonly id: string;
  readonly provider: string;
  readonly displayName?: string;
}

/**
 * Real API shape: runs use `runId`, not `_id`.
 * There is no `opCount` or `provider` field on runs — provider comes from the source.
 */
interface IRunItem {
  readonly runId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly uploadedAt?: string;
  readonly committedAt?: string;
  readonly error?: string;
}

interface IActionBoardResponse {
  readonly buckets: ReadonlyArray<{
    readonly items: ReadonlyArray<{
      readonly assignmentExternalId: string;
      readonly title: string;
      readonly dueAt?: string;
      readonly status: string;
      readonly course: { readonly externalId: string; readonly name: string };
    }>;
  }>;
}

/**
 * Real API shape: top-level key is `courseGrades`, not `courses`.
 * Each entry uses `courseExternalId`/`courseName`/`officialGrade`, not
 * `externalId`/`name`/`currentGrade`.
 */
interface IStudentGradesResponse {
  readonly studentId?: string;
  readonly overallGPA?: number;
  readonly courseGrades?: ReadonlyArray<{
    readonly courseExternalId: string;
    readonly courseName: string;
    readonly officialGrade?: number | null;
    readonly letterGrade?: string | null;
    readonly gradeSource?: string;
    readonly totalAssignments?: number;
    readonly gradedAssignments?: number;
  }>;
}

export class ScholarmancyApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async login(email: string, password: string): Promise<IAuthResponse> {
    const res = await this._post<IAuthResponse>('/api/auth/login', { email, password }, false);
    const accessToken = res.token ?? res.accessToken;
    if (!accessToken) {
      throw new Error('Login response did not include an access token');
    }
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    if (res.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refreshToken);
    }
    return res;
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(CONNECTOR_TOKEN_KEY);
  }

  async isLoggedIn(): Promise<boolean> {
    // A refresh token is enough — the session can be restored transparently.
    const access = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (access != null) return true;
    const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return refresh != null;
  }

  // ---------------------------------------------------------------------------
  // Connector token
  // ---------------------------------------------------------------------------

  async getOrMintConnectorToken(): Promise<string> {
    const cached = await SecureStore.getItemAsync(CONNECTOR_TOKEN_KEY);
    if (cached) return cached;

    const res = await this._post<IConnectorTokenResponse>(
      '/api/integrations/scraper-token',
      {},
      true
    );
    await SecureStore.setItemAsync(CONNECTOR_TOKEN_KEY, res.token);
    return res.token;
  }

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  async getStudents(): Promise<IStudentListItem[]> {
    return this._get<IStudentListItem[]>('/api/students');
  }

  // ---------------------------------------------------------------------------
  // Student data
  // ---------------------------------------------------------------------------

  async getStudentAssignments(studentId: string): Promise<IAssignmentItem[]> {
    try {
      const board = await this._get<IActionBoardResponse>(
        `/api/students/${studentId}/action-board`
      );
      return board.buckets.flatMap((b) =>
        b.items.map((item) => ({
          _id: item.assignmentExternalId,
          title: item.title,
          dueAt: item.dueAt,
          status: item.status,
          courseName: item.course.name,
          courseExternalId: item.course.externalId,
        }))
      );
    } catch {
      return [];
    }
  }

  async getStudentGrades(studentId: string): Promise<IGradeItem[]> {
    try {
      const data = await this._get<IStudentGradesResponse>(`/api/students/${studentId}/grades`);
      const today = new Date().toISOString().slice(0, 10);
      return (data.courseGrades ?? []).map((c) => ({
        _id: c.courseExternalId,
        courseExternalId: c.courseExternalId,
        asOfDate: today,
        percentGrade: c.officialGrade ?? undefined,
        letterGrade: c.letterGrade ?? undefined,
        courseName: c.courseName,
      }));
    } catch {
      return [];
    }
  }

  async getStudentRuns(studentId: string): Promise<ISyncRunItem[]> {
    try {
      const sources = await this._get<ISourceItem[]>(`/api/students/${studentId}/sources`);
      const allRuns: ISyncRunItem[] = [];
      for (const source of sources) {
        try {
          const runs = await this._get<IRunItem[]>(
            `/api/students/${studentId}/sources/${source.id}/runs`
          );
          allRuns.push(
            ...runs.map((r) => ({
              _id: r.runId,
              provider: source.provider,
              status: r.status,
              startedAt: r.startedAt,
            }))
          );
        } catch {
          // skip individual failing sources — others may succeed
        }
      }
      return allRuns
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 20);
    } catch {
      return [];
    }
  }

  async getPushToken(): Promise<string | null> {
    return SecureStore.getItemAsync('slc_push_token');
  }

  async registerPushToken(expoPushToken: string): Promise<void> {
    await this._post('/api/account/push-token', { expoPushToken }, true);
    await SecureStore.setItemAsync('slc_push_token', expoPushToken);
  }

  // ---------------------------------------------------------------------------
  // Ingest (three-step: runs → envelope → complete)
  // ---------------------------------------------------------------------------

  async uploadEnvelope(envelope: ISlcIngestEnvelopeV1, connectorToken: string): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${connectorToken}`,
    };
    const runId = envelope.run.runId;

    const runRes = await fetch(`${this.baseUrl}/api/ingest/v1/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        runId,
        provider: envelope.run.provider,
        adapterId: envelope.run.adapterId,
        sourceId: envelope.source.sourceId,
        startedAt: envelope.run.startedAt,
        clientMeta: envelope.run.meta ?? { clientType: 'mobile' },
      }),
    });
    if (!runRes.ok) throw new Error(`Run registration failed: ${runRes.status}`);
    const runBody = (await runRes.json()) as { runId?: string };
    const serverRunId = runBody.runId ?? runId;

    const envelopeRes = await fetch(`${this.baseUrl}/api/ingest/v1/runs/${serverRunId}/envelope`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...envelope,
        run: { ...envelope.run, runId: serverRunId },
      }),
    });
    if (!envelopeRes.ok) throw new Error(`Envelope upload failed: ${envelopeRes.status}`);

    const completeRes = await fetch(`${this.baseUrl}/api/ingest/v1/runs/${serverRunId}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'success' }),
    });
    if (!completeRes.ok) throw new Error(`Run completion failed: ${completeRes.status}`);
  }

  async reportRunFailure(params: {
    readonly runId: string;
    readonly sourceId: string;
    readonly connectorToken: string;
    readonly error: string;
    readonly clientMeta?: Readonly<Record<string, string>>;
  }): Promise<void> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.connectorToken}`,
    };
    const runRes = await fetch(`${this.baseUrl}/api/ingest/v1/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        runId: params.runId,
        sourceId: params.sourceId,
        clientMeta: params.clientMeta ?? { clientType: 'mobile' },
      }),
    });
    const runBody = runRes.ok
      ? ((await runRes.json()) as { runId?: string })
      : { runId: params.runId };
    const serverRunId = runBody.runId ?? params.runId;
    await fetch(`${this.baseUrl}/api/ingest/v1/runs/${serverRunId}/complete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ status: 'failed', error: params.error }),
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async _getAccessToken(): Promise<string> {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (token) return token;
    return this._refreshAccessToken();
  }

  private async _refreshAccessToken(): Promise<string> {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new Error('Not logged in');

    const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('Session expired — please log in again');

    const data = (await res.json()) as IAuthResponse;
    const accessToken = data.token ?? data.accessToken;
    if (!accessToken) throw new Error('Session expired — please log in again');
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    // The server rotates refresh tokens; persist the new one or the next
    // refresh will fail with an invalidated token.
    if (data.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
    }
    return accessToken;
  }

  private async _get<T>(path: string): Promise<T> {
    const doGet = async (token: string): Promise<Response> =>
      fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    let res = await doGet(await this._getAccessToken());
    if (res.status === 401) {
      // Access token expired (15 min TTL) — refresh once and retry.
      res = await doGet(await this._refreshAccessToken());
    }
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown, requireAuth: boolean): Promise<T> {
    const doPost = async (authToken?: string): Promise<Response> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      return fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    };

    let res = await doPost(requireAuth ? await this._getAccessToken() : undefined);
    if (requireAuth && res.status === 401) {
      res = await doPost(await this._refreshAccessToken());
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(text || `POST ${path} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}

/** Singleton API client — configured via EXPO_PUBLIC_API_URL environment variable. */
export const apiClient = new ScholarmancyApiClient(
  process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.scholarmancy.com'
);
