import { apiClient } from './client';

export interface IAlert {
  readonly id: string;
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly createdAt: string;
  readonly acknowledged: boolean;
}

/**
 * Alerts API methods.
 */
export const alertsApi = {
  /**
   * Get all alerts for the current user.
   *
   * @returns Array of alerts
   */
  async getAll(): Promise<readonly IAlert[]> {
    try {
      return await apiClient.get<readonly IAlert[]>('/alerts-api');
    } catch (error) {
      console.error('Failed to load alerts:', error);
      return [];
    }
  },

  /**
   * Acknowledge an alert.
   *
   * @param id - Alert ID
   * @returns True if acknowledged
   */
  async acknowledge(id: string): Promise<boolean> {
    const response = await apiClient.post<{ readonly success: boolean }>(`/alerts-api/${id}/acknowledge`, {});

    return response.success ?? false;
  },
};

