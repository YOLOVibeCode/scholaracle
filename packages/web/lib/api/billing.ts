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
};
