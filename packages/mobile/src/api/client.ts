/**
 * Scholaracle API client for the mobile app.
 *
 * Handles JWT auth (access + refresh tokens), connector token minting with
 * 401 self-healing, and ingest envelope upload.
 *
 * All response types come from @scholaracle/contracts (types/api/*) — the
 * same definitions the server compiles against. Do NOT redeclare response
 * shapes here; that is how the app shipped reading fields that never existed.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type {
  ISlcIngestEnvelopeV1,
  IStudentListItem,
  IStudentCreateRequest,
  IStudentGradesResponse,
  IStudentMaterialsResponse,
  IActionBoardResponse,
  ISourceListItem,
  IRunListItem,
  IAuthLoginResponse,
  IAuthRefreshResponse,
  IAuthUser,
  ITodayView,
  IWorkPackView,
  IPushTokenRequest,
  IConnectorTokenResponse,
  IIngestSourceRegisterRequest,
  IIngestRunStartResponse,
  ISourceInviteIssueRequest,
  ISourceInviteIssueResponse,
  ISourceInvitePayload,
  ISourceInviteRedeemResponse,
} from '@scholaracle/contracts';
import { parseTodayView, parseWorkPackView } from '@scholaracle/contracts';
import { ApiError } from './ApiError';
import { getDeviceId } from '../device/deviceId';

export type { IStudentListItem } from '@scholaracle/contracts';

const ACCESS_TOKEN_KEY = 'slc_access_token';
const REFRESH_TOKEN_KEY = 'slc_refresh_token';
const LEGACY_CONNECTOR_TOKEN_KEY = 'slc_connector_token';
const CONNECTOR_TOKEN_KEY = 'slc_connector_token_v2';
const PUSH_TOKEN_KEY = 'slc_push_token';
const SESSION_USER_KEY = 'slc_session_user';

/** Apple Review airplane-mode: fail fast instead of spinning on a hung fetch. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const OFFLINE_ERROR_CODE = 'OFFLINE';
export const OFFLINE_ERROR_MESSAGE = "You're offline. Connect to the internet to continue.";

export interface IApiClientOptions {
  readonly requestTimeoutMs?: number;
}

/** Flattened assignment view-model consumed by DashboardScreen. */
export interface IAssignmentItem {
  readonly _id: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status?: string;
  readonly courseName?: string;
  readonly courseExternalId?: string;
  /** Matches ICourseGradeAssignment.externalId — used to navigate to detail. */
  readonly assignmentExternalId?: string;
}

/** Run view-model consumed by DashboardScreen (provider comes from the source). */
export interface ISyncRunItem {
  readonly _id: string;
  readonly provider: string;
  readonly status: string;
  readonly startedAt: string;
}

interface IStoredConnectorToken {
  readonly token: string;
  readonly mintedAt: number;
}

export class ScholarmancyApiClient {
  private readonly baseUrl: string;
  private readonly _requestTimeoutMs: number;
  private _refreshPromise: Promise<string> | null = null;
  private _sessionEpoch = 0;

  /**
   * Invoked when the SERVER rejects a refresh — the session is
   * unrecoverable and the UI should return to the login screen. Receives
   * the epoch the dead session belonged to; compare against sessionEpoch
   * to ignore stragglers from a superseded session.
   */
  public onSessionExpired?: (epoch: number) => void;

  constructor(baseUrl: string, options: IApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this._requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** Increments on every login/logout; identifies the current session. */
  get sessionEpoch(): number {
    return this._sessionEpoch;
  }

  /** The configured API base URL (used to classify resource-link hosts). */
  get baseUrlValue(): string {
    return this.baseUrl;
  }

  /**
   * Every network call goes through here so airplane mode fails in seconds
   * with a readable error instead of hanging on the splash/spinner.
   */
  private async _timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this._requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: unknown) {
      throw mapFetchFailure(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async login(email: string, password: string): Promise<IAuthLoginResponse> {
    const res = await this._post<IAuthLoginResponse>('/api/auth/login', { email, password }, false);
    await this._persistSession(res, 'Login');
    return res;
  }

  async register(email: string, password: string, name: string): Promise<IAuthLoginResponse> {
    const res = await this._post<IAuthLoginResponse>(
      '/api/auth/register',
      { email, password, name, rememberMe: true },
      false
    );
    await this._persistSession(res, 'Register');
    return res;
  }

  async loginWithOAuth(
    provider: 'google' | 'apple' | 'microsoft',
    providerAccountId: string,
    email: string,
    name: string,
    internalSecret: string
  ): Promise<IAuthLoginResponse> {
    const res = await this._postWithHeaders<IAuthLoginResponse>(
      '/api/auth/oauth',
      { provider, providerAccountId, email, name },
      { 'x-internal-api-secret': internalSecret },
      false
    );
    await this._persistSession(res, 'OAuthLogin');
    return res;
  }

  async loginWithMagicToken(token: string): Promise<IAuthLoginResponse> {
    const res = await this._post<IAuthLoginResponse>('/api/auth/magic', { token }, false);
    await this._persistSession(res, 'MagicLogin');
    return res;
  }

  async createStudent(request: IStudentCreateRequest): Promise<IStudentListItem> {
    return this._post<IStudentListItem>('/api/students', request, true);
  }

  async logout(): Promise<void> {
    this._sessionEpoch += 1;
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(CONNECTOR_TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(LEGACY_CONNECTOR_TOKEN_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(SESSION_USER_KEY).catch(() => undefined);
  }

  async getSessionUser(): Promise<IAuthUser | null> {
    const raw = await SecureStore.getItemAsync(SESSION_USER_KEY);
    if (raw != null && raw !== '') {
      try {
        const parsed = JSON.parse(raw) as Partial<IAuthUser>;
        const user = sessionUserFromPartial(parsed);
        if (user) return user;
      } catch {
        // fall through to JWT
      }
    }
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return token != null ? userFromAccessToken(token) : null;
  }

  async isLoggedIn(): Promise<boolean> {
    // A refresh token is enough — the session can be restored transparently.
    const access = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (access != null) return true;
    const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    return refresh != null;
  }

  // ---------------------------------------------------------------------------
  // Connector token (mint revokes previous tokens server-side, so a cached
  // token can be invalidated at any time by another device — heal on 401)
  // ---------------------------------------------------------------------------

  async getOrMintConnectorToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    if (!options.forceRefresh) {
      const cached = await this._readCachedConnectorToken();
      if (cached) return cached;
    }

    const res = await this._post<IConnectorTokenResponse>(
      '/api/integrations/scraper-token',
      {},
      true
    );
    const stored: IStoredConnectorToken = { token: res.token, mintedAt: Date.now() };
    await SecureStore.setItemAsync(CONNECTOR_TOKEN_KEY, JSON.stringify(stored));
    return res.token;
  }

  private async _readCachedConnectorToken(): Promise<string | null> {
    const raw = await SecureStore.getItemAsync(CONNECTOR_TOKEN_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<IStoredConnectorToken>;
        if (typeof parsed.token === 'string' && parsed.token.length > 0) return parsed.token;
      } catch {
        // corrupt cache — fall through to re-mint
      }
      await SecureStore.deleteItemAsync(CONNECTOR_TOKEN_KEY);
      return null;
    }
    // Migrate the legacy plain-string cache once.
    const legacy = await SecureStore.getItemAsync(LEGACY_CONNECTOR_TOKEN_KEY);
    if (legacy) {
      const migrated: IStoredConnectorToken = { token: legacy, mintedAt: 0 };
      await SecureStore.setItemAsync(CONNECTOR_TOKEN_KEY, JSON.stringify(migrated));
      await SecureStore.deleteItemAsync(LEGACY_CONNECTOR_TOKEN_KEY);
      return legacy;
    }
    return null;
  }

  /**
   * Connector-authenticated fetch with one-shot 401 healing: on 401 the
   * cached token is discarded, a fresh one is minted, and the request is
   * retried once. Covers server-side revocation (minting from another
   * device revokes this one's token).
   */
  private async _connectorFetch(
    path: string,
    init: { method: string; body?: string },
    initialToken?: string
  ): Promise<Response> {
    const doFetch = async (token: string): Promise<Response> =>
      this._timedFetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: init.body,
      });

    let res = await doFetch(initialToken ?? (await this.getOrMintConnectorToken()));
    if (res.status === 401) {
      const fresh = await this.getOrMintConnectorToken({ forceRefresh: true });
      res = await doFetch(fresh);
    }
    return res;
  }

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  async getStudents(): Promise<IStudentListItem[]> {
    return this._get<IStudentListItem[]>('/api/students');
  }

  // ---------------------------------------------------------------------------
  // Student studio (IStudioApi — student JWT only)
  // ---------------------------------------------------------------------------

  async getStudioToday(): Promise<ITodayView> {
    return parseTodayView(await this._get<unknown>('/api/studio/today'));
  }

  async getStudioWorkPack(assignmentExternalId: string): Promise<IWorkPackView> {
    return parseWorkPackView(
      await this._get<unknown>(
        `/api/studio/assignments/${encodeURIComponent(assignmentExternalId)}`
      )
    );
  }

  async patchStudioAssignmentStatus(
    assignmentExternalId: string,
    status: 'not_started' | 'working_on_it' | 'need_help' | 'done' | null
  ): Promise<void> {
    await this._patch(
      `/api/studio/assignments/${encodeURIComponent(assignmentExternalId)}/status`,
      { status }
    );
  }

  // ---------------------------------------------------------------------------
  // Student data (studentId = the Mongo `id` from GET /api/students —
  // NEVER the external/SIS id)
  // ---------------------------------------------------------------------------

  async getStudentAssignments(studentId: string): Promise<IAssignmentItem[]> {
    const board = await this._get<IActionBoardResponse>(`/api/students/${studentId}/action-board`);
    return board.buckets.flatMap((b) =>
      b.items.map((item) => ({
        // Keyed per course so the same assignment id in two courses stays unique
        _id: `${item.course.externalId}:${item.assignmentExternalId}`,
        title: item.title,
        dueAt: item.dueAt,
        status: item.status,
        courseName: item.course.name,
        courseExternalId: item.course.externalId,
        assignmentExternalId: item.assignmentExternalId,
      }))
    );
  }

  async getStudentGrades(studentId: string): Promise<IStudentGradesResponse> {
    const current = await this._get<IStudentGradesResponse>(`/api/students/${studentId}/grades`);
    if (current.courseGrades.length > 0) return current;
    // Off-season (e.g. summer): every term has ended, so the server's
    // current-only default filters ALL courses out. Fall back to all
    // grading periods so the most recent term's grades still render.
    return this._get<IStudentGradesResponse>(`/api/students/${studentId}/grades?currentOnly=false`);
  }

  /**
   * Materials for one assignment. The server's ?assignment= filter is an OR
   * (exact matches plus the whole course) — callers partition the result via
   * partitionMaterials. Responses carry signed URLs with a 24h TTL, so this
   * must be re-fetched on every mount and never cached.
   */
  async getAssignmentMaterials(
    studentId: string,
    assignmentExternalId: string
  ): Promise<IStudentMaterialsResponse> {
    return this._get<IStudentMaterialsResponse>(
      `/api/students/${studentId}/materials?assignment=${encodeURIComponent(assignmentExternalId)}`
    );
  }

  async getStudentRuns(studentId: string): Promise<ISyncRunItem[]> {
    const sources = await this._get<ISourceListItem[]>(`/api/students/${studentId}/sources`);
    const allRuns: ISyncRunItem[] = [];
    let lastSourceError: unknown = null;
    let failedSources = 0;

    for (const source of sources) {
      try {
        const runs = await this._get<IRunListItem[]>(
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
      } catch (err) {
        // Partial failure tolerated — but if EVERY source fails, surface it.
        lastSourceError = err;
        failedSources += 1;
      }
    }

    if (sources.length > 0 && failedSources === sources.length) {
      throw lastSourceError instanceof Error
        ? lastSourceError
        : new Error('Failed to load sync history');
    }

    return allRuns
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 20);
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  async getPushToken(): Promise<string | null> {
    return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  }

  async registerPushToken(expoPushToken: string): Promise<void> {
    const deviceId = await getDeviceId();
    const type = Platform.OS === 'android' ? 'android' : 'ios';
    const user = await this.getSessionUser();
    const audience = user?.role === 'student' ? 'student' : 'parent';
    const body: IPushTokenRequest = {
      expoPushToken,
      deviceId,
      type,
      audience,
      ...(audience === 'student' && user?.studentId ? { studentId: user.studentId } : {}),
    };
    await this._post('/api/account/push-token', body, true);
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, expoPushToken);
  }

  /**
   * Remove this device's push registration server-side (sign-out). Must run
   * while the auth token is still valid.
   */
  async unregisterPushToken(): Promise<void> {
    const deviceId = await getDeviceId();
    await this._delete('/api/account/push-token', { deviceId });
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // Ingest (source registration + three-step run: runs → envelope → complete)
  // ---------------------------------------------------------------------------

  /**
   * Register (upsert) the ingest source server-side. Without this,
   * GET /api/students/:id/sources filters the source out and the sync
   * history stays empty. Safe to call repeatedly.
   */
  async registerIngestSource(source: IIngestSourceRegisterRequest): Promise<void> {
    const res = await this._connectorFetch('/api/ingest/v1/sources', {
      method: 'POST',
      body: JSON.stringify(source),
    });
    if (!res.ok) throw await ApiError.fromResponse(res, 'Source registration');
  }

  async redeemSourceInvite(token: string): Promise<ISourceInvitePayload> {
    const res = await this._post<ISourceInviteRedeemResponse>(
      '/api/source-invites/redeem',
      { token },
      true
    );
    return res.invite;
  }

  async issueSourceInvite(request: ISourceInviteIssueRequest): Promise<ISourceInviteIssueResponse> {
    return this._post<ISourceInviteIssueResponse>('/api/source-invites', request, true);
  }

  async uploadEnvelope(envelope: ISlcIngestEnvelopeV1, connectorToken: string): Promise<void> {
    const runId = envelope.run.runId;

    const runRes = await this._connectorFetch(
      '/api/ingest/v1/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          runId,
          sourceId: envelope.source.sourceId,
          clientMeta: envelope.run.meta ?? { clientType: 'mobile' },
        }),
      },
      connectorToken
    );
    if (!runRes.ok) throw await ApiError.fromResponse(runRes, 'Run registration');
    const runBody = (await runRes.json()) as Partial<IIngestRunStartResponse>;
    const serverRunId = runBody.runId ?? runId;

    const envelopeRes = await this._connectorFetch(`/api/ingest/v1/runs/${serverRunId}/envelope`, {
      method: 'POST',
      body: JSON.stringify({ ...envelope, run: { ...envelope.run, runId: serverRunId } }),
    });
    if (!envelopeRes.ok) throw await ApiError.fromResponse(envelopeRes, 'Envelope upload');

    const completeRes = await this._connectorFetch(`/api/ingest/v1/runs/${serverRunId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ status: 'success' }),
    });
    if (!completeRes.ok) throw await ApiError.fromResponse(completeRes, 'Run completion');
  }

  async reportRunFailure(params: {
    readonly runId: string;
    readonly sourceId: string;
    readonly connectorToken: string;
    readonly error: string;
    readonly clientMeta?: Readonly<Record<string, string>>;
  }): Promise<void> {
    const runRes = await this._connectorFetch(
      '/api/ingest/v1/runs',
      {
        method: 'POST',
        body: JSON.stringify({
          runId: params.runId,
          sourceId: params.sourceId,
          clientMeta: params.clientMeta ?? { clientType: 'mobile' },
        }),
      },
      params.connectorToken
    );
    const runBody = runRes.ok
      ? ((await runRes.json()) as Partial<IIngestRunStartResponse>)
      : { runId: params.runId };
    const serverRunId = runBody.runId ?? params.runId;
    await this._connectorFetch(`/api/ingest/v1/runs/${serverRunId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ status: 'failed', error: params.error }),
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async _persistSession(res: IAuthLoginResponse, action: string): Promise<void> {
    if (!res.token) {
      throw new Error(`${action} response did not include an access token`);
    }
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, res.token);
    if (res.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, res.refreshToken);
    }
    await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(sessionUserFromLogin(res)));
    this._sessionEpoch += 1;
  }

  private async _getAccessToken(): Promise<string> {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (token) return token;
    return this._refreshAccessToken();
  }

  /**
   * Single-flight: concurrent 401s (e.g. the dashboard's parallel fetches)
   * share ONE refresh. Without this, each spends the same rotating refresh
   * token and the server treats the reuse as an attack, revoking the whole
   * token family.
   */
  private _refreshAccessToken(): Promise<string> {
    if (!this._refreshPromise) {
      this._refreshPromise = this._doRefresh().finally(() => {
        this._refreshPromise = null;
      });
    }
    return this._refreshPromise;
  }

  private async _doRefresh(): Promise<string> {
    const epoch = this._sessionEpoch;
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      // Simply not logged in — that is NOT a session expiry. Firing the
      // expiry callback here made stragglers purge freshly-written tokens.
      throw new Error('Not logged in');
    }

    const res = await this._timedFetch(`${this.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      this.onSessionExpired?.(epoch);
      throw new Error('Session expired — please log in again');
    }

    const data = (await res.json()) as IAuthRefreshResponse;
    if (!data.token) {
      this.onSessionExpired?.(epoch);
      throw new Error('Session expired — please log in again');
    }
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.token);
    // The server rotates refresh tokens; persist the new one or the next
    // refresh will fail with an invalidated token.
    if (data.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
    }
    return data.token;
  }

  private async _get<T>(path: string): Promise<T> {
    const doGet = async (token: string): Promise<Response> =>
      this._timedFetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    let res = await doGet(await this._getAccessToken());
    if (res.status === 401) {
      // Access token expired (15 min TTL) — refresh once and retry.
      res = await doGet(await this._refreshAccessToken());
    }
    if (!res.ok) throw await ApiError.fromResponse(res, `GET ${path}`);
    return res.json() as Promise<T>;
  }

  private async _patch<T>(path: string, body: unknown): Promise<T> {
    const doPatch = async (authToken: string): Promise<Response> =>
      this._timedFetch(`${this.baseUrl}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });

    let res = await doPatch(await this._getAccessToken());
    if (res.status === 401) {
      res = await doPatch(await this._refreshAccessToken());
    }
    if (!res.ok) throw await ApiError.fromResponse(res, `PATCH ${path}`);
    return res.json() as Promise<T>;
  }

  private async _delete<T>(path: string, body: unknown): Promise<T> {
    const doDelete = async (authToken: string): Promise<Response> =>
      this._timedFetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });

    let res = await doDelete(await this._getAccessToken());
    if (res.status === 401) {
      res = await doDelete(await this._refreshAccessToken());
    }
    if (!res.ok) throw await ApiError.fromResponse(res, `DELETE ${path}`);
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown, requireAuth: boolean): Promise<T> {
    const doPost = async (authToken?: string): Promise<Response> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      return this._timedFetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    };

    let res = await doPost(requireAuth ? await this._getAccessToken() : undefined);
    if (requireAuth && res.status === 401) {
      res = await doPost(await this._refreshAccessToken());
    }
    if (!res.ok) throw await ApiError.fromResponse(res, `POST ${path}`);
    return res.json() as Promise<T>;
  }

  private async _postWithHeaders<T>(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
    requireAuth: boolean
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
    if (requireAuth) {
      const token = await this._getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await this._timedFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await ApiError.fromResponse(res, `POST ${path}`);
    return res.json() as Promise<T>;
  }
}

/** Singleton API client — configured via EXPO_PUBLIC_API_URL environment variable. */
export const apiClient = new ScholarmancyApiClient(
  process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.scholarmancy.com'
);

function mapFetchFailure(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (isOfflineLike(err)) {
    return new ApiError(OFFLINE_ERROR_MESSAGE, 0, OFFLINE_ERROR_CODE);
  }
  const message = err instanceof Error ? err.message : 'Request failed';
  return new ApiError(message, 0, 'NETWORK_ERROR');
}

function isOfflineLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  const message = err.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('the internet connection appears to be offline') ||
    message.includes('aborted') ||
    message.includes('the network connection was lost')
  );
}

function sessionUserFromLogin(res: IAuthLoginResponse): IAuthUser {
  const raw = res.user;
  const role = raw?.role === 'student' ? 'student' : 'parent';
  return {
    id: raw?.id ?? '',
    email: raw?.email ?? '',
    name: raw?.name ?? '',
    role,
    ...(role === 'student' && raw?.studentId ? { studentId: raw.studentId } : {}),
  };
}

function sessionUserFromPartial(parsed: Partial<IAuthUser>): IAuthUser | null {
  if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') return null;
  const role = parsed.role === 'student' ? 'student' : 'parent';
  return {
    id: parsed.id,
    email: parsed.email,
    name: typeof parsed.name === 'string' ? parsed.name : '',
    role,
    ...(role === 'student' && typeof parsed.studentId === 'string' && parsed.studentId !== ''
      ? { studentId: parsed.studentId }
      : {}),
  };
}

function userFromAccessToken(token: string): IAuthUser | null {
  const payloadPart = token.split('.')[1];
  if (payloadPart === undefined || payloadPart === '') return null;
  try {
    const padded = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(withPad, 'base64').toString('utf8')
        : atob(withPad);
    const payload = JSON.parse(json) as {
      userId?: string;
      email?: string;
      role?: string;
      studentId?: string;
    };
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
    return sessionUserFromPartial({
      id: payload.userId,
      email: payload.email,
      name: '',
      role: payload.role === 'student' ? 'student' : 'parent',
      ...(typeof payload.studentId === 'string' ? { studentId: payload.studentId } : {}),
    });
  } catch {
    return null;
  }
}
