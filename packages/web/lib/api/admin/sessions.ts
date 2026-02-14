import { apiClient } from '../client';

export interface IAdminSessionDeviceInfo {
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: string;
}

export interface IAdminSession {
  readonly id: string;
  readonly deviceInfo: IAdminSessionDeviceInfo;
  readonly ipAddress: string;
  readonly location?: string;
  readonly lastActiveAt: string;
  readonly createdAt: string;
  readonly isCurrent: boolean;
}

export interface IAdminSessionsResponse {
  readonly success: boolean;
  readonly sessions?: readonly IAdminSession[];
  readonly error?: string;
}

export const adminSessionsApi = {
  async list(): Promise<readonly IAdminSession[]> {
    const response = await apiClient.get<IAdminSessionsResponse>('/admin/sessions', true);
    if (!response.success || !response.sessions) {
      return [];
    }
    return response.sessions;
  },

  async revoke(sessionId: string): Promise<boolean> {
    try {
      const response = await apiClient.delete<{ success?: boolean }>(
        `/admin/sessions/${sessionId}`,
        undefined,
        true
      );
      return response?.success === true;
    } catch {
      return false;
    }
  },
};
