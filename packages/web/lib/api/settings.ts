import { apiClient } from './client';

export interface INotificationSettings {
  readonly push?: boolean;
  readonly email?: boolean;
  readonly sms?: boolean;
}

export interface IAlertThresholds {
  readonly gradeDrop?: number;
  readonly daysBeforeDeadline?: number;
  readonly lowGradeThreshold?: number;
}

export interface IUserSettings {
  readonly notifications: {
    readonly push: boolean;
    readonly email: boolean;
    readonly sms: boolean;
  };
  readonly alerts: {
    readonly gradeDrop: number;
    readonly daysBeforeDeadline: number;
    readonly lowGradeThreshold: number;
  };
}

export interface IUpdateSettingsRequest {
  readonly notifications?: INotificationSettings;
  readonly alerts?: IAlertThresholds;
}

/**
 * Settings API client.
 */
export const settingsApi = {
  /**
   * Get user settings.
   */
  async get(): Promise<IUserSettings> {
    try {
      return await apiClient.get<IUserSettings>('/settings');
    } catch (error) {
      console.error('Failed to load settings:', error);
      return {
        notifications: {
          push: true,
          email: true,
          sms: false,
        },
        alerts: {
          gradeDrop: 5,
          daysBeforeDeadline: 2,
          lowGradeThreshold: 80,
        },
      };
    }
  },

  /**
   * Update all settings.
   */
  async update(settings: IUpdateSettingsRequest): Promise<boolean> {
    try {
      const response = await apiClient.put<{ readonly success: boolean }>('/settings', settings);
      return response.success ?? false;
    } catch (error) {
      console.error('Failed to update settings:', error);
      return false;
    }
  },
};
