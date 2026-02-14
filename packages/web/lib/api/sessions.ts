import { apiClient } from './client';

export interface ISessionDeviceInfo {
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: string;
}

export interface ISession {
  readonly id: string;
  readonly deviceInfo: ISessionDeviceInfo;
  readonly ipAddress: string;
  readonly location?: string;
  readonly lastActiveAt: string;
  readonly createdAt: string;
  readonly isCurrent: boolean;
}

export interface ISessionsResponse {
  readonly success: boolean;
  readonly sessions?: readonly ISession[];
  readonly error?: string;
}

export const sessionsApi = {
  async list(): Promise<readonly ISession[]> {
    const response = await apiClient.get<ISessionsResponse>('/sessions');
    if (!response.success || !response.sessions) {
      return [];
    }
    return response.sessions;
  },

  async revoke(sessionId: string): Promise<boolean> {
    try {
      const response = await apiClient.delete<{ success?: boolean }>(`/sessions/${sessionId}`);
      return response?.success === true;
    } catch {
      return false;
    }
  },

  async revokeAllOther(): Promise<number> {
    try {
      const response = await apiClient.delete<{ success?: boolean; revoked?: number }>('/sessions');
      return response?.revoked ?? 0;
    } catch {
      return 0;
    }
  },
};
