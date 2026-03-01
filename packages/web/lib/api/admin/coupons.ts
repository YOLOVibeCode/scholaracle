import { apiClient } from '../client';

export interface ICoupon {
  readonly id: string;
  readonly code: string;
  readonly type: 'trial_extension' | 'percent_off' | 'amount_off' | 'free_plan';
  readonly value: number;
  readonly plan: string | null;
  readonly duration: 'once' | 'repeating' | 'forever';
  readonly durationMonths: number | null;
  readonly maxRedemptions: number | null;
  readonly redemptionCount: number;
  readonly expiresAt: string | null;
  readonly isActive: boolean;
  readonly isValid: boolean;
  readonly isExpired: boolean;
  readonly isExhausted: boolean;
  readonly remainingRedemptions: number | null;
  readonly discountLabel: string;
  readonly description: string | null;
  readonly createdBy: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ICouponRedemption {
  readonly userId: string;
  readonly redeemedAt: string;
  readonly subscriptionId?: string;
}

export interface ICouponDetail extends ICoupon {
  readonly redemptions: readonly ICouponRedemption[];
}

export interface ICreateCouponRequest {
  readonly code: string;
  readonly type: ICoupon['type'];
  readonly value: number;
  readonly plan?: string;
  readonly duration: ICoupon['duration'];
  readonly durationMonths?: number;
  readonly maxRedemptions?: number;
  readonly expiresAt?: string;
  readonly description?: string;
}

export const adminCouponsApi = {
  async list(status?: string): Promise<{ success: boolean; data?: readonly ICoupon[]; error?: string }> {
    const qs = status ? `?status=${status}` : '';
    return apiClient.get(`/admin/coupons${qs}`, true);
  },

  async get(id: string): Promise<{ success: boolean; data?: ICouponDetail; error?: string }> {
    return apiClient.get(`/admin/coupons/${id}`, true);
  },

  async create(data: ICreateCouponRequest): Promise<{ success: boolean; data?: ICoupon; error?: string }> {
    return apiClient.post('/admin/coupons', data, true);
  },

  async update(
    id: string,
    data: Partial<Pick<ICreateCouponRequest, 'description' | 'maxRedemptions' | 'expiresAt' | 'plan'>>
  ): Promise<{ success: boolean; data?: ICoupon; error?: string }> {
    return apiClient.put(`/admin/coupons/${id}`, data, true);
  },

  async toggle(id: string): Promise<{ success: boolean; isActive?: boolean; error?: string }> {
    return apiClient.post(`/admin/coupons/${id}/toggle`, {}, true);
  },
};
