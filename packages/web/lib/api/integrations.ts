import { apiClient } from './client';

export interface IIntegration {
  readonly id: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly schedule: string;
  readonly dataTypes: readonly string[];
  readonly enabled: boolean;
  readonly linkedStudents?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ICreateIntegrationRequest {
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly schedule?: 'hourly' | 'every_6h' | 'daily' | 'manual';
  readonly dataTypes?: string[];
  readonly enabled?: boolean;
}

export interface IUpdateIntegrationRequest {
  readonly displayName?: string;
  readonly portalBaseUrl?: string;
  readonly schedule?: 'hourly' | 'every_6h' | 'daily' | 'manual';
  readonly dataTypes?: string[];
  readonly enabled?: boolean;
}

export interface IIntegrationLinkedStudent {
  readonly studentId: string;
  readonly studentName: string;
  readonly hasCredentials: boolean;
  readonly enabled: boolean;
  readonly status: string;
  readonly lastSuccess?: string;
  readonly lastError?: string | null;
}

export interface IAssignStudentCredentials {
  readonly authType: 'api' | 'login';
  readonly accessToken?: string;
  readonly username?: string;
  readonly password?: string;
  readonly baseUrl?: string;
}

export interface IAssignStudentRequest {
  readonly credentials?: IAssignStudentCredentials;
}

/**
 * Integrations API (account-level providers).
 */
export const integrationsApi = {
  async list(): Promise<readonly IIntegration[]> {
    try {
      return await apiClient.get<readonly IIntegration[]>('/integrations');
    } catch (error) {
      console.error('Failed to load integrations:', error);
      return [];
    }
  },

  async get(id: string): Promise<IIntegration | null> {
    try {
      return await apiClient.get<IIntegration>(`/integrations/${id}`);
    } catch (error) {
      console.error('Failed to load integration:', error);
      return null;
    }
  },

  async create(body: ICreateIntegrationRequest): Promise<IIntegration | null> {
    try {
      return await apiClient.post<IIntegration>('/integrations', body);
    } catch (error) {
      console.error('Failed to create integration:', error);
      return null;
    }
  },

  async update(id: string, body: IUpdateIntegrationRequest): Promise<IIntegration | null> {
    try {
      return await apiClient.put<IIntegration>(`/integrations/${id}`, body);
    } catch (error) {
      console.error('Failed to update integration:', error);
      return null;
    }
  },

  async delete(id: string): Promise<{ success: boolean; unlinkedCount?: number }> {
    try {
      const res = await apiClient.delete<{ success?: boolean; unlinkedCount?: number }>(
        `/integrations/${id}`
      );
      return { success: res.success ?? false, unlinkedCount: res.unlinkedCount };
    } catch (error) {
      console.error('Failed to delete integration:', error);
      return { success: false };
    }
  },

  async listStudents(integrationId: string): Promise<readonly IIntegrationLinkedStudent[]> {
    try {
      return await apiClient.get<readonly IIntegrationLinkedStudent[]>(
        `/integrations/${integrationId}/students`
      );
    } catch (error) {
      console.error('Failed to load integration students:', error);
      return [];
    }
  },

  async assignStudent(
    integrationId: string,
    studentId: string,
    body?: IAssignStudentRequest
  ): Promise<{ studentId: string; integrationId: string; hasCredentials: boolean } | null> {
    try {
      return await apiClient.post<{
        studentId: string;
        integrationId: string;
        hasCredentials: boolean;
      }>(`/integrations/${integrationId}/students/${studentId}`, body ?? {});
    } catch (error) {
      console.error('Failed to assign student to integration:', error);
      return null;
    }
  },

  async unlinkStudent(integrationId: string, studentId: string): Promise<boolean> {
    try {
      const res = await apiClient.delete<{ success?: boolean }>(
        `/integrations/${integrationId}/students/${studentId}`
      );
      return res.success ?? false;
    } catch (error) {
      console.error('Failed to unlink student from integration:', error);
      return false;
    }
  },
};
