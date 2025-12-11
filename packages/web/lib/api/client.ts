const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000/api';

export interface IApiError {
  readonly success: false;
  readonly error: string;
}

export interface IApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * API client for making requests to the backend.
 */
export class ApiClient {
  private readonly _baseUrl: string;
  private _token: string | null = null;

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
      : this._token;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as IApiError;
        throw new Error(errorData.error ?? `HTTP ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Network error');
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

