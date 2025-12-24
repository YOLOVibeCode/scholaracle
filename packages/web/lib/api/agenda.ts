import { apiClient, type IApiResponse } from './client';

export interface IAgendaItem {
  readonly id: string;
  readonly type: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
}

export interface IAgendaResponse {
  readonly items: readonly IAgendaItem[];
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
};


