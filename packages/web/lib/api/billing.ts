import { apiClient } from './client';
import type { BillingCycle } from '@/lib/billing/planCatalog';

export interface IPlanFeatures {
  readonly maxStudents: number;
  readonly emailNotifications: boolean;
  readonly smsNotifications: boolean;
  readonly prioritySupport: boolean;
  readonly advancedAnalytics: boolean;
}

export interface ISubscriptionInfo {
  readonly plan: string;
  readonly status: string;
  /** The plan whose limits apply now; 'free' once cancelled, paused or lapsed. */
  readonly effectivePlan?: string;
  readonly maxStudents?: number;
  readonly features?: IPlanFeatures;
  readonly featureLines?: readonly string[];
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly trialEnd?: string;
  readonly billingCycle?: string;
  readonly cancelAtPeriodEnd?: boolean;
  /** True only for a running paid store subscription (not a coupon trial or a past-due card). */
  readonly canChangePlan?: boolean;
}

/** What the API answers to a plan change: when it applies, plus the full subscription. */
export interface IChangePlanResult {
  readonly subscription: ISubscriptionInfo;
  /** `next_period`: the store scheduled it, and the buyer keeps the current plan until renewal. */
  readonly effective: 'now' | 'next_period';
  readonly pendingPlan?: { readonly plan: string; readonly billingCycle: BillingCycle };
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

interface IChangePlanResponse extends ISubscriptionResponse, IChangePlanResult {}

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
   * Create a store checkout session and return its URL.
   * @param plan - Subscription plan (starter, premium, family, enterprise)
   * @param billingCycle - monthly or annual
   */
  async createCheckout(
    plan: string,
    billingCycle: 'monthly' | 'annual' = 'monthly'
  ): Promise<string | null> {
    try {
      const res = await apiClient.post<ICheckoutResponse>('/billing/checkout', {
        plan,
        billingCycle,
      });
      return res.url;
    } catch (error) {
      console.error('Failed to create checkout:', error);
      return null;
    }
  },

  /**
   * Cancel the paid subscription at the end of the current period.
   */
  async cancelSubscription(): Promise<ISubscriptionInfo | null> {
    try {
      const res = await apiClient.post<ISubscriptionResponse>('/billing/cancel');
      return res.subscription;
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      return null;
    }
  },

  /**
   * Switch the paid subscription to another plan or billing cycle. Throws on
   * failure so the caller can show the reason next to the confirm button.
   */
  async changePlan(
    plan: string,
    billingCycle: BillingCycle = 'monthly'
  ): Promise<IChangePlanResult> {
    try {
      const res = await apiClient.post<IChangePlanResponse>('/billing/change-plan', {
        plan,
        billingCycle,
        confirmed: true,
      });
      return {
        subscription: res.subscription,
        effective: res.effective,
        ...(res.pendingPlan ? { pendingPlan: res.pendingPlan } : {}),
      };
    } catch (error) {
      console.error('Failed to change plan:', error);
      throw error;
    }
  },

  /**
   * The store's page to update the card on a paid subscription, or the
   * in-app billing page when there is none.
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
  async validateCoupon(code: string): Promise<{
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
   * subscription without going through store checkout.
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
