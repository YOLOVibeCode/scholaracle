import { apiClient, ApiClientError } from '../client';

export type CommunicationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'phone' | 'support_ticket';
export type CommunicationType = 'notification' | 'marketing' | 'support' | 'billing' | 'system' | 'alert';
export type CommunicationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opened' | 'clicked';

export interface IAdminCommunicationLogItem {
  readonly id: string;
  readonly userId: string;
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;
  readonly subject?: string;
  readonly content: string;
  readonly templateId?: string;
  readonly templateName?: string;
  readonly recipientEmail?: string;
  readonly status: CommunicationStatus;
  readonly createdAt: string;
  readonly sentAt?: string;
}

export interface IAdminCommunicationLogsResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminCommunicationLogItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly error?: string;
}

export interface IAdminSendCommunicationResponse {
  readonly success: boolean;
  readonly data?: { readonly id: string };
  readonly error?: string;
}

export interface IAdminCommunicationsAnalyticsResponse {
  readonly success: boolean;
  readonly data?: {
    readonly days: number;
    readonly total: number;
    readonly sent: number;
    readonly delivered: number;
    readonly opened: number;
    readonly clicked: number;
    readonly failed: number;
    readonly bounced: number;
    readonly deliveryRate: number;
    readonly openRate: number;
    readonly clickRate: number;
  };
  readonly error?: string;
}

export interface IAdminCommunicationTemplate {
  readonly id: string;
  readonly name: string;
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;
  readonly subject: string;
  readonly content: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IAdminCommunicationTemplatesResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminCommunicationTemplate[];
  readonly error?: string;
}

export interface IAdminCommunicationBatchItem {
  readonly id: string;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly criteria: { readonly role?: string; readonly emails?: readonly string[] };
  readonly subject: string;
  readonly templateName?: string;
  readonly totalRecipients: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface IAdminCommunicationBatchesResponse {
  readonly success: boolean;
  readonly data?: readonly IAdminCommunicationBatchItem[];
  readonly error?: string;
  readonly code?: string;
}

export const adminCommunicationsApi = {
  async listLogs(params: { userId?: string; recipientEmail?: string; status?: CommunicationStatus; channel?: CommunicationChannel; type?: CommunicationType; page?: number; limit?: number } = {}): Promise<IAdminCommunicationLogsResponse> {
    const qs = new URLSearchParams();
    if (params.userId) qs.set('userId', params.userId);
    if (params.recipientEmail) qs.set('recipientEmail', params.recipientEmail);
    if (params.status) qs.set('status', params.status);
    if (params.channel) qs.set('channel', params.channel);
    if (params.type) qs.set('type', params.type);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<IAdminCommunicationLogsResponse>(`/admin/communications/logs${suffix}`, true);
  },

  async sendEmail(payload: { recipientEmail: string; subject?: string; content?: string; templateId?: string }): Promise<IAdminSendCommunicationResponse> {
    return apiClient.post<IAdminSendCommunicationResponse>('/admin/communications/send', payload, true);
  },

  async listTemplates(): Promise<IAdminCommunicationTemplatesResponse> {
    return apiClient.get<IAdminCommunicationTemplatesResponse>('/admin/communications/templates', true);
  },

  async createTemplate(payload: { name: string; channel: CommunicationChannel; type: CommunicationType; subject: string; content: string }): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
    return apiClient.post<{ success: boolean; data?: { id: string }; error?: string }>('/admin/communications/templates', payload, true);
  },

  async updateTemplate(id: string, payload: { name?: string; subject?: string; content?: string; isActive?: boolean }): Promise<{ success: boolean; error?: string }> {
    return apiClient.put<{ success: boolean; error?: string }>(`/admin/communications/templates/${id}`, payload, true);
  },

  async bulkSend(
    payload: { criteria: { role?: string; emails?: readonly string[] }; subject?: string; content?: string; templateId?: string },
    stepUpToken?: string
  ): Promise<{ success: boolean; data?: { batchId: string }; error?: string; code?: string }> {
    try {
      if (!stepUpToken) {
        return await apiClient.post<{ success: boolean; data?: { batchId: string }; error?: string; code?: string }>('/admin/communications/bulk-send', payload, true);
      }
      return await apiClient.request<{ success: boolean; data?: { batchId: string }; error?: string; code?: string }>(
        '/admin/communications/bulk-send',
        { method: 'POST', body: JSON.stringify(payload), headers: { 'x-admin-stepup': stepUpToken } },
        true
      );
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  async listBatches(): Promise<IAdminCommunicationBatchesResponse> {
    try {
      return await apiClient.get<IAdminCommunicationBatchesResponse>('/admin/communications/batches', true);
    } catch (error) {
      const e = error as unknown;
      if (e instanceof ApiClientError) return { success: false, error: e.message, code: e.code };
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  async getAnalytics(days: number = 30): Promise<IAdminCommunicationsAnalyticsResponse> {
    const qs = new URLSearchParams();
    qs.set('days', String(days));
    return apiClient.get<IAdminCommunicationsAnalyticsResponse>(`/admin/communications/analytics?${qs.toString()}`, true);
  },
};


