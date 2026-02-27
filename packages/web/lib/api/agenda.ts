import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgendaImportance = 'critical' | 'high' | 'medium' | 'low';

export interface IAgendaItem {
  readonly id: string;
  readonly type?: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
  readonly studentName?: string;
  readonly studentExternalId?: string;
  readonly importance?: AgendaImportance;
  readonly aiSummary?: string;
  readonly labels?: readonly string[];
  readonly reminders?: readonly { readonly sentAt: string; readonly channel?: string }[];
}

export interface IAgendaResponse {
  readonly items: readonly IAgendaItem[];
}

interface IAgendaGetRangeResponse {
  readonly success: boolean;
  readonly data?: IAgendaResponse;
  readonly error?: string;
}

interface IAgendaSnoozeParams {
  readonly itemType: 'assignment' | 'event_occurrence';
  readonly itemKey: string;
  readonly snoozedUntil: string;
  readonly scope?: 'occurrence' | 'series';
}

interface IAgendaSnoozeResponse {
  readonly success: boolean;
  readonly data?: { readonly snoozedUntil: string };
  readonly error?: string;
}

interface ISendReminderParams {
  readonly itemId: string;
  readonly channel: 'sms' | 'email';
  readonly title: string;
  readonly studentName?: string;
  readonly courseName?: string;
  readonly timeAt: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Agenda API: get range, snooze, send reminder.
 */
export const agendaApi = {
  async getRange(fromIso: string, toIso: string): Promise<IAgendaGetRangeResponse> {
    const q = new URLSearchParams({ from: fromIso, to: toIso });
    return apiClient.get<IAgendaGetRangeResponse>(`/agenda?${q.toString()}`);
  },

  async snooze(params: IAgendaSnoozeParams): Promise<IAgendaSnoozeResponse> {
    return apiClient.post<IAgendaSnoozeResponse>('/agenda/snooze', params);
  },

  async sendReminder(params: ISendReminderParams): Promise<{ readonly success: boolean; readonly error?: string }> {
    return apiClient.post<{ readonly success: boolean; readonly error?: string }>('/agenda/remind', params);
  },
};
