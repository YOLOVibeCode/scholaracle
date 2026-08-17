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
  readonly authType: 'api';
  readonly accessToken?: string;
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
    readonly authType: 'api' | 'oauth2' | 'api-key';
    readonly accessToken?: string;
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
    return apiClient.get<readonly IIntegration[]>('/integrations');
  },

  async get(id: string): Promise<IIntegration | null> {
    return apiClient.get<IIntegration>(`/integrations/${id}`);
  },

  async create(body: ICreateIntegrationRequest): Promise<IIntegration | null> {
    return apiClient.post<IIntegration>('/integrations', body);
  },

  async update(id: string, body: IUpdateIntegrationRequest): Promise<IIntegration | null> {
    return apiClient.put<IIntegration>(`/integrations/${id}`, body);
  },

  async delete(id: string): Promise<{ success: boolean; unlinkedCount?: number }> {
    const res = await apiClient.delete<{ success?: boolean; unlinkedCount?: number }>(
      `/integrations/${id}`
    );
    return { success: res.success ?? false, unlinkedCount: res.unlinkedCount };
  },

  async listStudents(integrationId: string): Promise<readonly IIntegrationLinkedStudent[]> {
    return apiClient.get<readonly IIntegrationLinkedStudent[]>(
      `/integrations/${integrationId}/students`
    );
  },

  async assignStudent(
    integrationId: string,
    studentId: string,
    body?: IAssignStudentRequest
  ): Promise<{ studentId: string; integrationId: string; hasCredentials: boolean } | null> {
    return apiClient.post<{
      studentId: string;
      integrationId: string;
      hasCredentials: boolean;
    }>(`/integrations/${integrationId}/students/${studentId}`, body ?? {});
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
    const res = await apiClient.delete<{ success?: boolean }>(
      `/integrations/${integrationId}/students/${studentId}`
    );
    return res.success ?? false;
  },

  async listReconciliationPending(): Promise<readonly IPendingReconciliation[]> {
    const res = await apiClient.get<{ success: boolean; pending: IPendingReconciliation[] }>(
      '/integrations/reconciliation/pending'
    );
    return res.pending ?? [];
  },

  async linkReconciliation(pendingId: string, studentId: string): Promise<boolean> {
    const res = await apiClient.post<{ success: boolean }>(
      `/integrations/reconciliation/${pendingId}/link`,
      { studentId }
    );
    return res.success ?? false;
  },

  async createStudentFromReconciliation(pendingId: string, name: string): Promise<{ studentId: string; name: string } | null> {
    const res = await apiClient.post<{ success: boolean; student?: { id: string; name: string }; linkedStudentId?: string }>(
      `/integrations/reconciliation/${pendingId}/create`,
      { name: name.trim() }
    );
    const id = res.linkedStudentId ?? res.student?.id;
    const studentName = res.student?.name ?? name.trim();
    return id ? { studentId: id, name: studentName } : null;
  },
};
