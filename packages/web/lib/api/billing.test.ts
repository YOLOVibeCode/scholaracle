import { billingApi, type ISubscriptionInfo, type IInvoice } from './billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeResponse(body: unknown, status = 200): Response {
  const isOk = status >= 200 && status < 300;
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: isOk ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: function () {
      return this as Response;
    },
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:2801/api';

describe('billingApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // getSubscription
  // -------------------------------------------------------------------------

  describe('getSubscription', () => {
    it('GETs /billing/subscription and returns subscription info', async () => {
      const sub: ISubscriptionInfo = {
        plan: 'premium',
        status: 'active',
        billingCycle: 'monthly',
        cancelAtPeriodEnd: false,
        featureLines: ['2 students', 'Advanced analytics'],
        features: {
          maxStudents: 2,
          emailNotifications: true,
          smsNotifications: true,
          prioritySupport: true,
          advancedAnalytics: true,
        },
      };
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, subscription: sub }));

      const result = await billingApi.getSubscription();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/subscription`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(sub);
    });

    it('returns free plan when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Server error'));

      const result = await billingApi.getSubscription();

      expect(result).toEqual({ plan: 'free', status: 'active' });
    });
  });

  // -------------------------------------------------------------------------
  // createCheckout
  // -------------------------------------------------------------------------

  describe('createCheckout', () => {
    it('POSTs to /billing/checkout with plan and billingCycle and returns URL', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({
          success: true,
          sessionId: 'order_123',
          url: 'https://store.noctusoft.com/checkout/example',
        })
      );

      const result = await billingApi.createCheckout('starter', 'monthly');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/checkout`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ plan: 'starter', billingCycle: 'monthly' }),
        })
      );
      expect(result).toBe('https://store.noctusoft.com/checkout/example');
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Checkout failed'));

      const result = await billingApi.createCheckout('starter', 'monthly');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------

  describe('cancelSubscription', () => {
    it('POSTs to /billing/cancel and returns the subscription as it will end', async () => {
      const sub: ISubscriptionInfo = {
        plan: 'starter',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodEnd: '2026-10-28T03:45:34.000Z',
        cancelAtPeriodEnd: true,
      };
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, subscription: sub }));

      const result = await billingApi.cancelSubscription();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/cancel`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual(sub);
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Cancel failed'));

      const result = await billingApi.cancelSubscription();

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createPortal
  // -------------------------------------------------------------------------

  describe('changePlan', () => {
    it('POSTs the confirmed change and returns when it applies plus the full subscription', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({
          success: true,
          effective: 'next_period',
          pendingPlan: { plan: 'premium', billingCycle: 'monthly' },
          subscription: { plan: 'family', status: 'active', featureLines: ['5 students'] },
        })
      );

      const result = await billingApi.changePlan('premium', 'monthly');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/change-plan`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ plan: 'premium', billingCycle: 'monthly', confirmed: true }),
        })
      );
      expect(result.effective).toBe('next_period');
      expect(result.pendingPlan).toEqual({ plan: 'premium', billingCycle: 'monthly' });
      expect(result.subscription.featureLines).toEqual(['5 students']);
    });

    it('has no pendingPlan when the change applied now', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({
          success: true,
          effective: 'now',
          subscription: { plan: 'premium', status: 'active' },
        })
      );

      const result = await billingApi.changePlan('premium', 'annual');

      expect(result.effective).toBe('now');
      expect(result.pendingPlan).toBeUndefined();
    });

    it('throws so the caller can show the reason', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      fetchSpy.mockRejectedValue(new Error('Change failed'));

      await expect(billingApi.changePlan('premium', 'monthly')).rejects.toThrow();

      consoleError.mockRestore();
    });
  });

  describe('createPortal', () => {
    it('POSTs to /billing/portal and returns URL', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({
          success: true,
          url: 'http://localhost:2800/settings',
        })
      );

      const result = await billingApi.createPortal();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/portal`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toBe('http://localhost:2800/settings');
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Portal failed'));

      const result = await billingApi.createPortal();

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getInvoices
  // -------------------------------------------------------------------------

  describe('getInvoices', () => {
    it('GETs /billing/invoices and returns invoice list', async () => {
      const invoices: IInvoice[] = [
        {
          id: 'in_1',
          amount: 19,
          currency: 'usd',
          status: 'paid',
          date: '2025-01-15T00:00:00.000Z',
          pdfUrl: 'https://store.noctusoft.com/receipt/1',
        },
      ];
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, invoices }));

      const result = await billingApi.getInvoices();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/invoices`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(invoices);
    });

    it('returns empty array when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Invoice fetch failed'));

      const result = await billingApi.getInvoices();

      expect(result).toEqual([]);
    });
  });
});
