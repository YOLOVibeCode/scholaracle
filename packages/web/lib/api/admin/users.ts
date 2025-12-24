import { apiClient, ApiClientError } from '../client';

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'billing' | 'analyst';

export interface IAdminUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: AdminRole;
  readonly isActive: boolean;
  readonly mfaEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IAdminUsersResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminUser[];
  readonly error?: string;
  readonly code?: string;
}

export const adminUsersApi = {
  async list(): Promise<IAdminUsersResponse> {
    try {
      return await apiClient.get<IAdminUsersResponse>('/admin/users', true);
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  async create(
    payload: { email: string; name: string; role: AdminRole; password: string },
    stepUpToken?: string
  ): Promise<{ success: boolean; data?: { id: string }; error?: string; code?: string }> {
    try {
      if (!stepUpToken) {
        return await apiClient.post<{ success: boolean; data?: { id: string }; error?: string; code?: string }>('/admin/users', payload, true);
      }
      return await apiClient.request<{ success: boolean; data?: { id: string }; error?: string; code?: string }>(
        '/admin/users',
        { method: 'POST', body: JSON.stringify(payload), headers: { 'x-admin-stepup': stepUpToken } },
        true
      );
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  async update(
    id: string,
    payload: { name?: string; role?: AdminRole; isActive?: boolean },
    stepUpToken?: string
  ): Promise<{ success: boolean; error?: string; code?: string }> {
    try {
      if (!stepUpToken) {
        return await apiClient.put<{ success: boolean; error?: string; code?: string }>(`/admin/users/${id}`, payload, true);
      }
      return await apiClient.request<{ success: boolean; error?: string; code?: string }>(
        `/admin/users/${id}`,
        { method: 'PUT', body: JSON.stringify(payload), headers: { 'x-admin-stepup': stepUpToken } },
        true
      );
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },
};


