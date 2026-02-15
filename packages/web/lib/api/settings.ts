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
  };
  readonly tone?: 'formal' | 'casual' | 'encouraging';
  readonly frequency?: 'minimal' | 'balanced' | 'proactive';
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
    };
    readonly tone?: 'formal' | 'casual' | 'encouraging';
    readonly frequency?: 'minimal' | 'balanced' | 'proactive';
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
