import { apiClient } from '../client';

export interface IAdminLoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface IAdminLoginResponse {
  readonly success: boolean;
  readonly token?: string;
  readonly requiresMFA?: boolean;
  readonly mfaToken?: string;
  readonly admin?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role: string;
  };
  readonly error?: string;
}

export interface IMFAVerifyRequest {
  readonly mfaToken: string;
  readonly token: string;
}

export interface IMFASetupResponse {
  readonly success: boolean;
  readonly secret?: string;
  readonly qrCodeUrl?: string;
  readonly manualEntryKey?: string;
  readonly error?: string;
}

export interface IStepUpStartResponse {
  readonly success: boolean;
  readonly data?: { stepUpId: string; expiresAt: number };
  readonly error?: string;
  readonly code?: string;
}

export interface IStepUpVerifyResponse {
  readonly success: boolean;
  readonly data?: { stepUpToken: string; expiresAt: number };
  readonly error?: string;
  readonly code?: string;
}

/**
 * Admin authentication API client.
 */
export const adminAuthApi = {
  /**
   * Admin login.
   */
  async login(email: string, password: string): Promise<IAdminLoginResponse> {
    const response = await apiClient.post<IAdminLoginResponse>('/admin/auth/login', {
      email,
      password,
    });
    
    if (response.success && response.token) {
      localStorage.setItem('adminToken', response.token);
      localStorage.setItem('adminUser', JSON.stringify(response.admin));
    }
    
    return response;
  },

  /**
   * Verify MFA token.
   */
  async verifyMFA(mfaToken: string, totpCode: string): Promise<IAdminLoginResponse> {
    const response = await apiClient.post<IAdminLoginResponse>('/admin/auth/mfa/verify', {
      mfaToken,
      token: totpCode,
    });
    
    if (response.success && response.token) {
      localStorage.setItem('adminToken', response.token);
      localStorage.setItem('adminUser', JSON.stringify(response.admin));
    }
    
    return response;
  },

  /**
   * Setup MFA for admin user.
   */
  async setupMFA(): Promise<IMFASetupResponse> {
    return apiClient.get<IMFASetupResponse>('/admin/auth/mfa/setup', true);
  },

  /**
   * Start a step-up challenge (requires MFA enabled).
   */
  async stepUpStart(): Promise<IStepUpStartResponse> {
    return apiClient.post<IStepUpStartResponse>('/admin/auth/step-up/start', {}, true);
  },

  /**
   * Verify a step-up challenge and receive a short-lived step-up token.
   */
  async stepUpVerify(stepUpId: string, totpCode: string): Promise<IStepUpVerifyResponse> {
    return apiClient.post<IStepUpVerifyResponse>('/admin/auth/step-up/verify', { stepUpId, token: totpCode }, true);
  },

  /**
   * Admin logout.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/admin/auth/logout', {}, true);
    } finally {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
    }
  },

  /**
   * Get current admin token.
   */
  getToken(): string | null {
    return localStorage.getItem('adminToken');
  },

  /**
   * Get current admin user.
   */
  getCurrentAdmin(): { id: string; email: string; name: string; role: string } | null {
    const adminStr = localStorage.getItem('adminUser');
    return adminStr ? JSON.parse(adminStr) : null;
  },

  /**
   * Check if admin is logged in.
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};


