/**
 * Admin Subscriptions API Client (ISP)
 *
 * Small, focused interface for subscription operations.
 * Follows Interface Segregation Principle.
 */

import { apiClient } from '../client';

export interface ISubscription {
  readonly id: string;
  readonly userId: string;
  readonly plan: 'free' | 'starter' | 'premium' | 'family' | 'enterprise';
  readonly status: 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing';
  readonly billingCycle?: 'monthly' | 'annual';
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAtPeriodEnd?: boolean;
  readonly canceledAt?: string;
  readonly events?: readonly unknown[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ISubscriptionsResponse {
  readonly success: boolean;
  readonly data?: readonly ISubscription[];
  readonly error?: string;
}

export interface ISubscriptionResponse {
  readonly success: boolean;
  readonly data?: ISubscription;
  readonly error?: string;
}

export interface ISubscriptionActionResponse {
  readonly success: boolean;
  readonly error?: string;
}

export interface IExtendTrialRequest {
  readonly days: number;
  readonly reason: string;
}

/**
 * Admin subscriptions API client.
 */
export const adminSubscriptionsApi = {
  /**
   * List subscriptions (optionally filter by user/status/plan).
   */
  async list(params?: {
    readonly userId?: string;
    readonly status?: string;
    readonly plan?: string;
  }): Promise<ISubscriptionsResponse> {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.status) qs.set('status', params.status);
    if (params?.plan) qs.set('plan', params.plan);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<ISubscriptionsResponse>(`/admin/subscriptions${suffix}`, true);
  },

  /**
   * Get subscription by ID.
   */
  async getById(id: string): Promise<ISubscriptionResponse> {
    return apiClient.get<ISubscriptionResponse>(`/admin/subscriptions/${id}`, true);
  },

  /**
   * Get subscription by user ID.
   */
  async getByUserId(userId: string): Promise<ISubscriptionsResponse> {
    return apiClient.get<ISubscriptionsResponse>(`/admin/subscriptions?userId=${userId}`, true);
  },

  /**
   * Change subscription plan.
   */
  async changePlan(
    userId: string,
    plan: ISubscription['plan']
  ): Promise<ISubscriptionActionResponse> {
    return apiClient.put<ISubscriptionActionResponse>(
      `/admin/subscriptions/${userId}/plan`,
      { plan },
      true
    );
  },

  /**
   * Cancel subscription.
   */
  async cancel(userId: string, reason: string): Promise<ISubscriptionActionResponse> {
    return apiClient.post<ISubscriptionActionResponse>(
      `/admin/subscriptions/${userId}/cancel`,
      { reason },
      true
    );
  },

  /**
   * Reactivate subscription.
   */
  async reactivate(userId: string): Promise<ISubscriptionActionResponse> {
    return apiClient.post<ISubscriptionActionResponse>(
      `/admin/subscriptions/${userId}/reactivate`,
      {},
      true
    );
  },

  /**
   * Extend trial.
   */
  async extendTrial(
    userId: string,
    request: IExtendTrialRequest
  ): Promise<ISubscriptionActionResponse> {
    return apiClient.post<ISubscriptionActionResponse>(
      `/admin/subscriptions/${userId}/extend-trial`,
      request,
      true
    );
  },
};
