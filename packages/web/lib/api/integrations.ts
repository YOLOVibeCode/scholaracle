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

export interface ITestConnectionRequest {
  readonly provider: string;
  readonly adapterId: string;
  readonly baseUrl?: string;
  readonly credentials: {
    readonly authType: 'api' | 'login' | 'oauth2' | 'api-key';
    readonly accessToken?: string;
    readonly username?: string;
    readonly password?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly apiKey?: string;
  };
}

export interface ITestConnectionResult {
  readonly success: boolean;
  readonly message: string;
  readonly durationMs: number;
  readonly details?: {
    readonly courseCount?: number;
    readonly userName?: string;
    readonly institutionName?: string;
  };
}

export interface IPendingReconciliation {
  readonly id: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly displayName: string;
  readonly createdAt?: string;
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

  async testConnection(body: ITestConnectionRequest): Promise<ITestConnectionResult> {
    try {
      return await apiClient.post<ITestConnectionResult>('/integrations/test-connection', body);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Test failed: ${msg}`, durationMs: 0 };
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

  async listReconciliationPending(): Promise<readonly IPendingReconciliation[]> {
    try {
      const res = await apiClient.get<{ success: boolean; pending: IPendingReconciliation[] }>(
        '/integrations/reconciliation/pending'
      );
      return res.pending ?? [];
    } catch (error) {
      console.error('Failed to load pending reconciliations:', error);
      return [];
    }
  },

  async linkReconciliation(pendingId: string, studentId: string): Promise<boolean> {
    try {
      const res = await apiClient.post<{ success: boolean }>(
        `/integrations/reconciliation/${pendingId}/link`,
        { studentId }
      );
      return res.success ?? false;
    } catch (error) {
      console.error('Failed to link reconciliation:', error);
      return false;
    }
  },

  async createStudentFromReconciliation(pendingId: string, name: string): Promise<{ studentId: string; name: string } | null> {
    try {
      const res = await apiClient.post<{ success: boolean; student?: { id: string; name: string }; linkedStudentId?: string }>(
        `/integrations/reconciliation/${pendingId}/create`,
        { name: name.trim() }
      );
      const id = res.linkedStudentId ?? res.student?.id;
      const studentName = res.student?.name ?? name.trim();
      return id ? { studentId: id, name: studentName } : null;
    } catch (error) {
      console.error('Failed to create student from reconciliation:', error);
      return null;
    }
  },
};
