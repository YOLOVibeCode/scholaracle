import { apiClient } from './client';

export interface ILoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface IRegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface IAuthResponse {
  readonly success: boolean;
  readonly token?: string;
  readonly user?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
  };
  readonly error?: string;
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
   * @returns Auth response
   */
  async login(email: string, password: string): Promise<IAuthResponse> {
    try {
      const response = await apiClient.post<IAuthResponse>('/auth/login', {
        email,
        password,
      });

      if (response.success && response.token) {
        apiClient.setToken(response.token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', response.token);
          document.cookie = `auth_token=${response.token}; path=/; max-age=604800; SameSite=Lax`;
        }
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  },

  /**
   * Register new user.
   *
   * @param email - User email
   * @param password - User password
   * @param name - User name
   * @returns Auth response
   */
  async register(email: string, password: string, name: string): Promise<IAuthResponse> {
    try {
      const response = await apiClient.post<IAuthResponse>('/auth/register', {
        email,
        password,
        name,
      });

      if (response.success && response.token) {
        apiClient.setToken(response.token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', response.token);
          document.cookie = `auth_token=${response.token}; path=/; max-age=604800; SameSite=Lax`;
        }
      }

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  },

  /**
   * Logout user.
   */
  logout(): void {
    apiClient.setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      // Clear cookie with matching attributes used when setting it.
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      // Extra hardening for browsers that prefer explicit expiry.
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      // Some environments require clearing without SameSite attribute as well.
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
   * Initialize auth token from localStorage.
   */
  initialize(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        apiClient.setToken(token);
      }
    }
  },
};
