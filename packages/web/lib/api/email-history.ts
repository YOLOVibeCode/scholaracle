import { apiClient } from './client';

export interface IEmailHistoryItem {
  readonly id: string;
  readonly subject?: string;
  readonly recipientEmail?: string;
  readonly status: string;
  readonly type: string;
  readonly templateName?: string;
  readonly sentAt?: string;
  readonly createdAt: string;
  readonly failureReason?: string;
  readonly hasHtmlContent: boolean;
}

export interface IEmailHistoryListResponse {
  readonly success: boolean;
  readonly data?: readonly IEmailHistoryItem[];
  readonly total?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly totalPages?: number;
  readonly canResend?: boolean;
}

export interface IEmailHistoryDetail {
  readonly id: string;
  readonly subject?: string;
  readonly content: string;
  readonly htmlContent?: string;
  readonly recipientEmail?: string;
  readonly status: string;
  readonly type: string;
  readonly channel: string;
  readonly templateName?: string;
  readonly sentAt?: string;
  readonly createdAt: string;
  readonly failureReason?: string;
}

export interface IEmailHistoryDetailResponse {
  readonly success: boolean;
  readonly data?: IEmailHistoryDetail;
}

export const emailHistoryApi = {
  async list(params?: {
    status?: string;
    page?: number;
    limit?: number;
    studentId?: string;
  }): Promise<IEmailHistoryListResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.studentId) query.set('studentId', params.studentId);
    const qs = query.toString();
    return apiClient.get<IEmailHistoryListResponse>(`/email-history${qs ? `?${qs}` : ''}`);
  },

  async getDetail(id: string): Promise<IEmailHistoryDetailResponse> {
    return apiClient.get<IEmailHistoryDetailResponse>(`/email-history/${id}`);
  },

  async resend(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return apiClient.post<{ success: boolean; message?: string; error?: string }>(
      `/email-history/${id}/resend`,
      {}
    );
  },
};
