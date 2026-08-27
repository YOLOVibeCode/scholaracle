import { apiClient } from './client';

export interface ILoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface IRegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly phone?: string;
  readonly smsConsent?: boolean;
}

export interface IAuthResponse {
  readonly success: boolean;
  readonly token?: string;
  readonly refreshToken?: string;
  readonly rememberMe?: boolean;
  readonly user?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role: 'parent' | 'student';
    readonly studentId?: string;
  };
  /** When true, client should redirect to password reset flow. */
  readonly forcePasswordReset?: boolean;
  readonly error?: string;
}

function persistAuthResponse(response: IAuthResponse): void {
  if (!(response.success && response.token)) {
    return;
  }
  apiClient.setToken(response.token);
  const useSessionStorage = response.rememberMe === false;
  if (response.refreshToken) {
    apiClient.setRefreshToken(response.refreshToken, useSessionStorage);
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', response.token);
    localStorage.setItem('remember_me', useSessionStorage ? 'false' : 'true');
    const maxAge = 15 * 60;
    document.cookie = `auth_token=${response.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
}

/**
 * Authentication API methods.
 */
export const authApi = {
  /**
   * Login user.
   *
   * @param email - User email
   * @param password - User password
   * @param rememberMe - If false, session-only (sessionStorage + shorter refresh token). Default true.
   * @returns Auth response
   */
  async login(email: string, password: string, rememberMe: boolean = true): Promise<IAuthResponse> {
    try {
      const response = await apiClient.post<IAuthResponse>('/auth/login', {
        email,
        password,
        rememberMe,
      });

      persistAuthResponse(response);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  },

  /**
   * Consume a one-time student magic-link token (iPad Camera → /login?magic=).
   */
  async loginWithMagicToken(token: string): Promise<IAuthResponse> {
    try {
      const response = await apiClient.post<IAuthResponse>('/auth/magic', { token });
      persistAuthResponse(response);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'That sign-in link expired. Ask a parent for a new QR code.',
      };
    }
  },

  /**
   * Register new user.
   *
   * @param email - User email
   * @param password - User password
   * @param name - User name
   * @param options - Optional phone number, SMS consent, and rememberMe (default true)
   * @returns Auth response
   */
  async register(
    email: string,
    password: string,
    name: string,
    options?: { phone?: string; smsConsent?: boolean; rememberMe?: boolean }
  ): Promise<IAuthResponse> {
    const rememberMe = options?.rememberMe !== false;
    try {
      const response = await apiClient.post<IAuthResponse>('/auth/register', {
        email,
        password,
        name,
        rememberMe,
        ...(options?.phone ? { phone: options.phone } : {}),
        ...(options?.smsConsent != null ? { smsConsent: options.smsConsent } : {}),
      });

      persistAuthResponse(response);
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  },

  /**
   * Request a password reset email. Always returns success to avoid email enumeration.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; error?: string }>(
        '/auth/forgot-password',
        { email }
      );
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send reset link',
      };
    }
  },

  /**
   * Reset password using token from email link.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await apiClient.post<{ success: boolean; error?: string }>(
        '/auth/reset-password',
        { token, newPassword }
      );
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset password',
      };
    }
  },

  /**
   * Logout user (revoke refresh token and clear local state).
   * Always call API so httpOnly refresh_token cookie is cleared server-side.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post<{ success?: boolean }>('/auth/logout', {
        refreshToken: apiClient.getRefreshToken() ?? undefined,
      });
    } catch {
      // Ignore network errors on logout
    }
    apiClient.setToken(null);
    apiClient.setRefreshToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('refresh_token');
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'auth_token=; path=/; max-age=0';
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  },

  /**
   * Get current auth token.
   *
   * @returns Auth token or null
   */
  getToken(): string | null {
    return apiClient.getToken();
  },

  /**
   * Initialize auth token and refresh token from storage (localStorage or sessionStorage per remember_me).
   */
  initialize(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) apiClient.setToken(token);
      const refreshToken = apiClient.getRefreshToken();
      if (refreshToken) {
        const useSessionStorage = localStorage.getItem('remember_me') === 'false';
        apiClient.setRefreshToken(refreshToken, useSessionStorage);
      }
    }
  },

  /**
   * Call refresh endpoint to get new access token. Used by API client on 401.
   */
  async refresh(): Promise<boolean> {
    const refreshToken = apiClient.getRefreshToken();
    if (!refreshToken) return false;
    const rememberMe = typeof window !== 'undefined' && localStorage.getItem('remember_me') !== 'false';
    try {
      const response = await apiClient.post<{
        success?: boolean;
        token?: string;
        refreshToken?: string;
        rememberMe?: boolean;
      }>('/auth/refresh', { refreshToken, rememberMe });
      if (response.success && response.token) {
        apiClient.setToken(response.token);
        const useSessionStorage = response.rememberMe === false;
        if (response.refreshToken) {
          apiClient.setRefreshToken(response.refreshToken, useSessionStorage);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', response.token);
          if (response.rememberMe !== undefined) {
            localStorage.setItem('remember_me', useSessionStorage ? 'false' : 'true');
          }
          const maxAge = 15 * 60;
          document.cookie = `auth_token=${response.token}; path=/; max-age=${maxAge}; SameSite=Lax`;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
};
