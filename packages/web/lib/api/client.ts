const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';

const REFRESH_TOKEN_KEY = 'refresh_token';
const REMEMBER_ME_KEY = 'remember_me';

/** Seconds before token expiry at which we trigger a proactive background refresh. */
const PROACTIVE_REFRESH_THRESHOLD_SEC = 2 * 60; // 2 minutes

/**
 * Decode JWT payload without verification (browser-safe, no crypto needed).
 * Returns the `exp` claim in seconds or null.
 */
function getTokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob !== 'undefined' ? atob(base64) : '';
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export interface IApiError {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
}

export interface IApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * API client for making requests to the backend.
 * On 401, attempts to refresh the access token and retries the request once.
 * Concurrent 401s share a single in-flight refresh (request queuing); after refresh completes, each request retries once.
 */
export class ApiClient {
  private readonly _baseUrl: string;
  private _token: string | null = null;
  private _refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this._baseUrl = baseUrl;
  }

  /**
   * Set authentication token.
   *
   * @param token - JWT token
   */
  public setToken(token: string | null): void {
    this._token = token;
  }

  /**
   * Get authentication token.
   *
   * @returns JWT token or null
   */
  public getToken(): string | null {
    return this._token;
  }

  /**
   * Set refresh token. When useSessionStorage is true (session-only), store in sessionStorage; otherwise localStorage.
   */
  public setRefreshToken(token: string | null, useSessionStorage?: boolean): void {
    if (typeof window !== 'undefined') {
      const session = useSessionStorage ?? (localStorage.getItem(REMEMBER_ME_KEY) === 'false');
      const storage = session ? sessionStorage : localStorage;
      if (token) storage.setItem(REFRESH_TOKEN_KEY, token);
      else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }

  /**
   * Get refresh token from the storage indicated by remember_me (localStorage or sessionStorage).
   */
  public getRefreshToken(): string | null {
    if (typeof window !== 'undefined') {
      const useSessionStorage = localStorage.getItem(REMEMBER_ME_KEY) === 'false';
      const storage = useSessionStorage ? sessionStorage : localStorage;
      return storage.getItem(REFRESH_TOKEN_KEY);
    }
    return null;
  }

  /**
   * Attempt to refresh access token. Returns true if new token was set.
   * Sends credentials and rememberMe so cookie and storage stay in sync.
   */
  private async _tryRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    const rememberMe = typeof window !== 'undefined' && localStorage.getItem(REMEMBER_ME_KEY) !== 'false';

    try {
      const response = await fetch(`${this._baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken ?? undefined, rememberMe }),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as {
        success?: boolean;
        token?: string;
        refreshToken?: string;
        rememberMe?: boolean;
      };
      if (!data.success || !data.token) return false;

      this.setToken(data.token);
      const useSessionStorage = data.rememberMe === false;
      if (data.refreshToken) this.setRefreshToken(data.refreshToken, useSessionStorage);
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', data.token);
        if (data.rememberMe !== undefined) {
          localStorage.setItem(REMEMBER_ME_KEY, useSessionStorage ? 'false' : 'true');
        }
        const maxAge = 15 * 60; // 15 min in seconds
        document.cookie = `auth_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Proactively refresh the access token in the background if it is about to expire.
   * This is a fire-and-forget call that does not block the current request.
   */
  private _maybeProactiveRefresh(): void {
    if (typeof window === 'undefined') return;
    const token = this._token ?? localStorage.getItem('auth_token');
    if (!token) return;

    const exp = getTokenExp(token);
    if (exp == null) return;

    const nowSec = Math.floor(Date.now() / 1000);
    if (exp > nowSec && exp - nowSec < PROACTIVE_REFRESH_THRESHOLD_SEC) {
      // Token is valid but close to expiry – refresh in the background
      if (!this._refreshPromise) {
        this._refreshPromise = this._tryRefresh().finally(() => {
          this._refreshPromise = null;
        });
      }
    }
  }

  /**
   * Make a GET request.
   *
   * @param endpoint - API endpoint
   * @param useAdminToken - Use admin token instead of user token
   * @returns Response data
   */
  public async get<T>(endpoint: string, useAdminToken: boolean = false): Promise<T> {
    return this._request<T>(endpoint, {
      method: 'GET',
    }, useAdminToken);
  }

  /**
   * Make a POST request.
   *
   * @param endpoint - API endpoint
   * @param data - Request body
   * @param useAdminToken - Use admin token instead of user token
   * @returns Response data
   */
  public async post<T>(endpoint: string, data?: unknown, useAdminToken: boolean = false): Promise<T> {
    return this._request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }, useAdminToken);
  }

  /**
   * Make a PUT request.
   *
   * @param endpoint - API endpoint
   * @param data - Request body
   * @param useAdminToken - Use admin token instead of user token
   * @returns Response data
   */
  public async put<T>(endpoint: string, data?: unknown, useAdminToken: boolean = false): Promise<T> {
    return this._request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }, useAdminToken);
  }

  /**
   * Make a DELETE request.
   *
   * @param endpoint - API endpoint
   * @param data - Request body
   * @param useAdminToken - Use admin token instead of user token
   * @returns Response data
   */
  public async delete<T>(endpoint: string, data?: unknown, useAdminToken: boolean = false): Promise<T> {
    return this._request<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
    }, useAdminToken);
  }

  /**
   * Make an HTTP request with full control over RequestInit (including headers).
   */
  public async request<T>(endpoint: string, options: RequestInit = {}, useAdminToken: boolean = false): Promise<T> {
    return this._request<T>(endpoint, options, useAdminToken);
  }

  /**
   * Make an HTTP request.
   *
   * @param endpoint - API endpoint
   * @param options - Request options
   * @param useAdminToken - Use admin token instead of user token
   * @returns Response data
   */
  private async _request<T>(endpoint: string, options: RequestInit = {}, useAdminToken: boolean = false): Promise<T> {
    const url = `${this._baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Get token from appropriate storage
    const token = useAdminToken
      ? (typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null)
      : (this._token ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null));

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const fetchOpts = { ...options, headers, credentials: 'include' as RequestCredentials };
      let response = await fetch(url, fetchOpts);

      // Only try refresh/redirect on 401 when we have a session and the request wasn't a login/register.
      // Login/register with wrong credentials return 401 and must throw so the form can show the error.
      const isAuthAttempt = endpoint === '/auth/login' || endpoint === '/auth/register' || endpoint === '/admin/auth/login';
      const hasSession = !useAdminToken && (!!token || !!this.getRefreshToken());
      if (
        response.status === 401 &&
        typeof window !== 'undefined' &&
        !useAdminToken &&
        hasSession &&
        !isAuthAttempt
      ) {
        if (!this._refreshPromise) {
          this._refreshPromise = this._tryRefresh().finally(() => {
            this._refreshPromise = null;
          });
        }
        const refreshed = await this._refreshPromise;
        if (refreshed) {
          const newToken = this.getToken() ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetch(url, { ...options, headers, credentials: 'include' });
          }
        }
        if (response.status === 401) {
          this._token = null;
          this.setRefreshToken(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            sessionStorage.removeItem(REFRESH_TOKEN_KEY);
            document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
            document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            window.location.href = '/login?reason=session_expired';
          }
        }
      }

      if (!response.ok) {
        let errorData: Partial<IApiError> | null = null;
        try {
          errorData = (await response.json()) as Partial<IApiError>;
        } catch {
          errorData = null;
        }

        const message = errorData?.error ?? `HTTP ${response.status}`;
        const code = errorData?.code;
        throw new ApiClientError(message, response.status, code, errorData);
      }

      // After a successful response, proactively refresh if the token is near expiry
      this._maybeProactiveRefresh();

      return (await response.json()) as T;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Network error');
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

