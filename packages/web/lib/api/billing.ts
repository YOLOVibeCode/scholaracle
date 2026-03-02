import { apiClient } from './client';

export interface ISubscriptionInfo {
  readonly plan: string;
  readonly status: string;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly billingCycle?: string;
  readonly cancelAtPeriodEnd?: boolean;
}

export interface IInvoice {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
  readonly date: string;
  readonly pdfUrl?: string;
  readonly hostedUrl?: string;
}

interface ICheckoutResponse {
  readonly success: boolean;
  readonly sessionId: string;
  readonly url: string;
}

interface IPortalResponse {
  readonly success: boolean;
  readonly url: string;
}

interface ISubscriptionResponse {
  readonly success: boolean;
  readonly subscription: ISubscriptionInfo;
}

interface IInvoicesResponse {
  readonly success: boolean;
  readonly invoices: IInvoice[];
}

/**
 * Billing API client.
 */
export const billingApi = {
  /**
   * Get current subscription status.
   */
  async getSubscription(): Promise<ISubscriptionInfo> {
    try {
      const res = await apiClient.get<ISubscriptionResponse>('/billing/subscription');
      return res.subscription;
    } catch (error) {
      console.error('Failed to load subscription:', error);
      return { plan: 'free', status: 'active' };
    }
  },

  /**
   * Create a Square payment link and return its URL.
   * @param plan - Subscription plan (starter, premium, family, enterprise)
   * @param billingCycle - monthly or annual
   */
  async createCheckout(plan: string, billingCycle: 'monthly' | 'annual' = 'monthly'): Promise<string | null> {
    try {
      const res = await apiClient.post<ICheckoutResponse>('/billing/checkout', { plan, billingCycle });
      return res.url;
    } catch (error) {
      console.error('Failed to create checkout:', error);
      return null;
    }
  },

  /**
   * Create a billing portal session. Square does not provide a portal; returns settings URL.
   */
  async createPortal(): Promise<string | null> {
    try {
      const res = await apiClient.post<IPortalResponse>('/billing/portal');
      return res.url;
    } catch (error) {
      console.error('Failed to create portal session:', error);
      return null;
    }
  },

  /**
   * Get invoice history.
   */
  async getInvoices(): Promise<IInvoice[]> {
    try {
      const res = await apiClient.get<IInvoicesResponse>('/billing/invoices');
      return res.invoices;
    } catch (error) {
      console.error('Failed to load invoices:', error);
      return [];
    }
  },

  /**
   * Validate a coupon code.
   */
  async validateCoupon(
    code: string
  ): Promise<{
    valid: boolean;
    coupon?: { code: string; type: string; value: number; discountLabel: string };
    error?: string;
  }> {
    try {
      return await apiClient.post('/billing/validate-coupon', { code });
    } catch {
      return { valid: false, error: 'Failed to validate coupon' };
    }
  },

  /**
   * Redeem a free-time coupon (trial_extension or free_plan) to start a trial
   * subscription without going through Square checkout.
   */
  async redeemCoupon(
    code: string,
    plan?: string
  ): Promise<{
    success: boolean;
    subscription?: { plan: string; status: string; trialEnd: string };
    message?: string;
    error?: string;
  }> {
    try {
      return await apiClient.post('/billing/redeem-coupon', { code, plan });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to redeem coupon',
      };
    }
  },
};
