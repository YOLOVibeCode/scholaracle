import { apiClient } from '../client';

export interface ISquarePlusRecommendation {
  readonly payingUserCount: number;
  readonly threshold: number;
  readonly considerSquarePlus: boolean;
  readonly message?: string;
}

export interface IAnalyticsOverview {
  readonly mrr: number;
  readonly churnRate: number;
  readonly arpu: number;
  readonly totalCustomers: number;
  readonly activeCustomers: number;
  readonly newCustomers: number;
  readonly squarePlusRecommendation?: ISquarePlusRecommendation;
}

export interface IGrowthDataPoint {
  readonly period: string;
  readonly count: number;
  readonly change: number;
  readonly changePercent: number;
}

export interface IRevenueDataPoint {
  readonly period: string;
  readonly revenue: number;
  readonly count: number;
}

/**
 * Admin analytics API client.
 */
export const adminAnalyticsApi = {
  /**
   * Get dashboard overview analytics.
   */
  async getOverview(): Promise<{ success: boolean; data: IAnalyticsOverview }> {
    return apiClient.get<{ success: boolean; data: IAnalyticsOverview }>(
      '/admin/analytics/overview',
      true
    );
  },

  /**
   * Get revenue data.
   */
  async getRevenue(params?: {
    period?: 'day' | 'week' | 'month' | 'year';
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; data: readonly IRevenueDataPoint[] }> {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);

    const query = queryParams.toString();
    return apiClient.get<{ success: boolean; data: readonly IRevenueDataPoint[] }>(
      `/admin/analytics/revenue${query ? `?${query}` : ''}`,
      true
    );
  },

  /**
   * Get customer growth data.
   */
  async getCustomerGrowth(params?: {
    period?: 'day' | 'week' | 'month' | 'year';
    months?: number;
  }): Promise<{ success: boolean; data: readonly IGrowthDataPoint[] }> {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.months) queryParams.set('months', params.months.toString());

    const query = queryParams.toString();
    return apiClient.get<{ success: boolean; data: readonly IGrowthDataPoint[] }>(
      `/admin/analytics/customers${query ? `?${query}` : ''}`,
      true
    );
  },

  /**
   * Get churn rate.
   */
  async getChurnRate(): Promise<{ success: boolean; data: { churnRate: number } }> {
    return apiClient.get<{ success: boolean; data: { churnRate: number } }>(
      '/admin/analytics/churn',
      true
    );
  },

  /**
   * Get subscription growth over time.
   */
  async getSubscriptions(params?: {
    period?: 'day' | 'week' | 'month' | 'year';
    months?: number;
  }): Promise<{ success: boolean; data: readonly IGrowthDataPoint[] }> {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.months) queryParams.set('months', params.months.toString());

    const query = queryParams.toString();
    return apiClient.get<{ success: boolean; data: readonly IGrowthDataPoint[] }>(
      `/admin/analytics/subscriptions${query ? `?${query}` : ''}`,
      true
    );
  },
};
