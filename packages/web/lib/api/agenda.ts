import { apiClient, type IApiResponse } from './client';

export type AgendaImportance = 'critical' | 'high' | 'medium' | 'low';

export interface IAgendaReminder {
  readonly channel: 'sms' | 'email';
  readonly sentAt: string;
  readonly status: 'sent' | 'delivered' | 'failed';
}

export interface IAgendaItem {
  readonly id: string;
  readonly type: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
  readonly studentName?: string;
  readonly studentExternalId?: string;
  readonly isOverdue?: boolean;
  readonly assignmentStatus?: 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';
  readonly eventCategory?: 'test' | 'quiz' | 'classwork' | 'project' | 'meeting' | 'field_trip' | 'activity' | 'deadline' | 'other';
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly labels: string[];
  readonly importance: AgendaImportance;
  readonly aiSummary?: string;
  readonly reminders: IAgendaReminder[];
}

export interface IAgendaResponse {
  readonly items: readonly IAgendaItem[];
}

export interface IRemindResponse {
  readonly sentAt: string;
  readonly channel: 'sms' | 'email';
}

export const agendaApi = {
  async getRange(fromIso: string, toIso: string): Promise<IApiResponse<IAgendaResponse>> {
    return apiClient.get<IApiResponse<IAgendaResponse>>(`/agenda?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
  },

  async snooze(params: {
    readonly itemType: 'assignment' | 'event_occurrence';
    readonly itemKey: string;
    readonly snoozedUntil: string;
    readonly scope?: 'occurrence' | 'series';
  }): Promise<IApiResponse<{ snoozedUntil: string }>> {
    return apiClient.post<IApiResponse<{ snoozedUntil: string }>>('/agenda/snooze', params);
  },

  async sendReminder(params: {
    readonly itemId: string;
    readonly channel: 'sms' | 'email';
    readonly title?: string;
    readonly studentName?: string;
    readonly courseName?: string;
    readonly timeAt?: string;
  }): Promise<IApiResponse<IRemindResponse>> {
    return apiClient.post<IApiResponse<IRemindResponse>>('/agenda/remind', params);
  },
};


