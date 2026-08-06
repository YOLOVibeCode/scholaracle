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

interface IAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface ILoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly _id: string; readonly email: string };
}

export interface IStudentListItem {
  readonly _id: string;
  readonly name: string;
  readonly externalId: string;
  readonly grade?: string;
}

interface IConnectorTokenResponse {
  readonly token: string;
  readonly expiresAt: string;
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

interface ISourceItem {
  readonly sourceId: string;
  readonly provider: string;
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

interface IStudentGradesResponse {
  readonly courses?: ReadonlyArray<{
    readonly externalId: string;
    readonly name: string;
    readonly currentGrade?: number;
    readonly letterGrade?: string;
    readonly gradedAt?: string;
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

  async login(email: string, password: string): Promise<ILoginResponse> {
    const res = await this._post<ILoginResponse>('/api/auth/login', { email, password }, false);
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, res.accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refreshToken);
    return res;
  }

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(CONNECTOR_TOKEN_KEY);
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return token != null;
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
    return this.get<IStudentListItem[]>('/api/students');
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
      return (data.courses ?? []).map((c) => ({
        _id: c.externalId,
        courseExternalId: c.externalId,
        asOfDate: c.gradedAt ?? new Date().toISOString().slice(0, 10),
        percentGrade: c.currentGrade,
        letterGrade: c.letterGrade,
        courseName: c.name,
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
          const runs = await this._get<ISyncRunItem[]>(
            `/api/students/${studentId}/sources/${source.sourceId}/runs`
          );
          allRuns.push(...runs);
        } catch {
          // skip failed sources
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
    await this.post('/api/account/push-token', { expoPushToken }, true);
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

    const data = (await res.json()) as IAuthTokens;
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.accessToken);
    return data.accessToken;
  }

  private async _get<T>(path: string): Promise<T> {
    const token = await this._getAccessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown, requireAuth: boolean): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (requireAuth) {
      headers['Authorization'] = `Bearer ${await this._getAccessToken()}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
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
