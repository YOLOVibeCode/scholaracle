import { apiClient } from './client';

export interface INotificationSettings {
  readonly push?: boolean;
  readonly email?: boolean;
  readonly sms?: boolean;
  readonly inApp?: boolean;
  readonly quietHours?: {
    readonly enabled: boolean;
    readonly start: string;
    readonly end: string;
    readonly criticalOverride: boolean;
  };
  readonly digestSchedule?: {
    readonly daily?: { readonly enabled: boolean; readonly time: string };
    readonly weekly?: { readonly enabled: boolean; readonly day: string; readonly time: string };
    readonly digestTimes?: readonly string[];
    readonly weekdaySlots?: readonly IDigestSlotApi[];
    readonly weekendSlots?: readonly IDigestSlotApi[];
    readonly schoolDays?: readonly string[];
    readonly holidayMode?: 'normal' | 'pause' | 'reduced';
    readonly autoSend?: boolean;
    readonly recipients?: 'everybody' | 'nobody' | 'specific';
    readonly specificRecipients?: readonly string[];
    readonly snoozeUntil?: string | null;
  };
  readonly tone?: 'formal' | 'casual' | 'encouraging';
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
  readonly glanceSchedule?: {
    readonly enabled: boolean;
    readonly time: string;
  };
}

export interface IDigestSlotApi {
  readonly time: string;
  readonly label: string;
  readonly enabled: boolean;
}

export interface IAlertThresholds {
  readonly gradeDrop?: number;
  readonly daysBeforeDeadline?: number;
  readonly lowGradeThreshold?: number;
  readonly prioritizeHighImpact?: boolean;
  readonly emphasizeWeakSubjects?: boolean;
  readonly celebrateWins?: boolean;
  readonly enabledTypes?: Record<string, { readonly enabled: boolean; readonly severity: string }>;
}

/** Dashboard UI preferences (synced across devices). */
export interface IDashboardSettings {
  readonly gradeDisplay?: 'letter' | 'score';
}

export interface IUserSettings {
  readonly dashboard?: IDashboardSettings;
  /** IANA timezone (e.g. 'America/New_York'). */
  readonly timezone?: string;
  readonly notifications: {
    readonly push: boolean;
    readonly email: boolean;
    readonly sms: boolean;
    readonly inApp?: boolean;
    readonly quietHours?: {
      readonly enabled: boolean;
      readonly start: string;
      readonly end: string;
      readonly criticalOverride: boolean;
    };
    readonly digestSchedule?: {
      readonly daily?: { readonly enabled: boolean; readonly time: string };
      readonly weekly?: { readonly enabled: boolean; readonly day: string; readonly time: string };
      readonly digestTimes?: readonly string[];
      readonly weekdaySlots?: readonly IDigestSlotApi[];
      readonly weekendSlots?: readonly IDigestSlotApi[];
      readonly schoolDays?: readonly string[];
      readonly holidayMode?: 'normal' | 'pause' | 'reduced';
      readonly autoSend?: boolean;
      readonly recipients?: 'everybody' | 'nobody' | 'specific';
      readonly specificRecipients?: readonly string[];
      readonly snoozeUntil?: string | null;
    };
    readonly tone?: 'formal' | 'casual' | 'encouraging';
    readonly frequency?: 'minimal' | 'balanced' | 'proactive';
    readonly glanceSchedule?: {
      readonly enabled: boolean;
      readonly time: string;
    };
  };
  readonly alerts: {
    readonly gradeDrop: number;
    readonly daysBeforeDeadline: number;
    readonly lowGradeThreshold: number;
    readonly prioritizeHighImpact?: boolean;
    readonly emphasizeWeakSubjects?: boolean;
    readonly celebrateWins?: boolean;
    readonly enabledTypes?: Record<string, { readonly enabled: boolean; readonly severity: string }>;
  };
}

export interface IUpdateSettingsRequest {
  readonly dashboard?: IDashboardSettings;
  readonly notifications?: INotificationSettings;
  readonly alerts?: IAlertThresholds;
  readonly timezone?: string;
}

export interface IHolidaySuggestion {
  readonly inHoliday?: boolean;
  readonly nextBreak?: { readonly start: string; readonly end: string; readonly name: string };
  readonly suggestion: string;
}

export interface INotificationHistoryItem {
  readonly id: string;
  readonly channel: string;
  readonly type: string;
  readonly subject?: string;
  readonly status: string;
  readonly recipientEmail?: string;
  readonly recipientPhone?: string;
  readonly sentAt?: string;
  readonly failedAt?: string;
  readonly failureReason?: string;
  readonly templateName?: string;
  readonly createdAt: string;
}

export interface IUserSettingsResponse extends IUserSettings {
  readonly profile?: {
    readonly name: string;
    readonly email: string;
    readonly oauthProviders: readonly string[];
  };
}

const defaultSettings: IUserSettings = {
  dashboard: { gradeDisplay: 'letter' },
  notifications: {
    push: true,
    email: true,
    sms: false,
    inApp: true,
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '07:00',
      criticalOverride: true,
    },
    digestSchedule: {
      daily: { enabled: true, time: '07:00' },
      weekly: { enabled: true, day: 'sunday', time: '18:00' },
      digestTimes: [],
      weekdaySlots: [
        { time: '09:00', label: 'Morning', enabled: true },
        { time: '15:00', label: 'Afternoon', enabled: true },
        { time: '20:00', label: 'Evening', enabled: true },
      ],
      weekendSlots: [],
      schoolDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      holidayMode: 'normal',
      autoSend: true,
      recipients: 'everybody',
      specificRecipients: [],
      snoozeUntil: null,
    },
    tone: 'encouraging',
    frequency: 'balanced',
  },
  alerts: {
    gradeDrop: 5,
    daysBeforeDeadline: 2,
    lowGradeThreshold: 80,
    prioritizeHighImpact: true,
    emphasizeWeakSubjects: true,
    celebrateWins: true,
  },
};

/**
 * Settings API client.
 */
export const settingsApi = {
  /**
   * Get user settings. Returns full preferences with defaults for missing fields.
   * May include profile (name, email, oauthProviders) when returned by API.
   */
  async get(): Promise<IUserSettingsResponse> {
    try {
      const res = await apiClient.get<IUserSettingsResponse>('/settings');
      return {
        dashboard: { ...defaultSettings.dashboard, ...res.dashboard },
        timezone: res.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        notifications: { ...defaultSettings.notifications, ...res.notifications },
        alerts: { ...defaultSettings.alerts, ...res.alerts },
        profile: res.profile,
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return { ...defaultSettings };
    }
  },

  /**
   * Unlink an OAuth provider from the current user.
   */
  async unlinkOAuth(provider: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiClient.delete<{ success: boolean; error?: string }>(
        `/settings/oauth/${encodeURIComponent(provider)}`
      );
      return res ?? { success: true };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error ?? err?.message ?? 'Failed to unlink';
      return { success: false, error: message };
    }
  },

  /**
   * Get AI suggestion for holiday digest pause based on academic terms.
   */
  async suggestHolidays(): Promise<IHolidaySuggestion | null> {
    try {
      const res = await apiClient.post<IHolidaySuggestion>('/settings/suggest-holidays', {});
      return res ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Fetch the user's notification/communication history (most recent 50).
   */
  async getNotificationHistory(): Promise<INotificationHistoryItem[]> {
    try {
      const res = await apiClient.get<{ success: boolean; data: INotificationHistoryItem[] }>(
        '/settings/notification-history'
      );
      return res.data ?? [];
    } catch {
      return [];
    }
  },

  /**
   * Update all settings. Send only the keys you want to change (e.g. { dashboard: { gradeDisplay: 'score' } }).
   */
  async update(settings: IUpdateSettingsRequest): Promise<boolean> {
    try {
      await apiClient.put<IUserSettings>('/settings', settings);
      return true;
    } catch (error) {
      console.error('Failed to update settings:', error);
      return false;
    }
  },
};
