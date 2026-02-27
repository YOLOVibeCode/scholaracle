/**
 * Admin Payments API Client (ISP)
 *
 * Small, focused interface for payment operations.
 * Follows Interface Segregation Principle.
 */

import { apiClient } from '../client';

export interface IPayment {
  readonly id: string;
  readonly userId: string;
  readonly subscriptionId?: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  readonly paymentMethod: 'card' | 'bank_transfer' | 'other';
  readonly amountRefunded?: number;
  readonly refundedAt?: string;
  readonly refundReason?: string;
  readonly createdAt: string;
}

export interface IPaymentsResponse {
  readonly success: boolean;
  readonly data?: readonly IPayment[];
  readonly error?: string;
}

export interface IAdminRefundPaymentRequest {
  readonly amount: number;
  readonly reason: string;
}

export interface IAdminRefundPaymentResponse {
  readonly success: boolean;
  readonly error?: string;
}

export interface IAdminRetryPaymentResponse {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Admin payments API client.
 */
export const adminPaymentsApi = {
  /**
   * List payments (optionally filter by status or userId).
   */
  async list(params?: {
    readonly status?: string;
    readonly userId?: string;
  }): Promise<IPaymentsResponse> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.userId) qs.set('userId', params.userId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<IPaymentsResponse>(`/admin/payments${suffix}`, true);
  },

  /**
   * Get payments for a user.
   */
  async getByUserId(userId: string): Promise<IPaymentsResponse> {
    return apiClient.get<IPaymentsResponse>(`/admin/payments?userId=${userId}`, true);
  },

  /**
   * Refund a payment.
   */
  async refund(
    paymentId: string,
    request: IAdminRefundPaymentRequest
  ): Promise<IAdminRefundPaymentResponse> {
    return apiClient.post<IAdminRefundPaymentResponse>(
      `/admin/payments/${paymentId}/refund`,
      request,
      true
    );
  },

  /**
   * Retry a failed payment.
   */
  async retry(paymentId: string): Promise<IAdminRetryPaymentResponse> {
    return apiClient.post<IAdminRetryPaymentResponse>(
      `/admin/payments/${paymentId}/retry`,
      {},
      true
    );
  },
};
