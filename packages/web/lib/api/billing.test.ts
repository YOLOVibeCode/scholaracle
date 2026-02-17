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
    clone: function () { return this as Response; },
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
      };
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, subscription: sub }));

      const result = await billingApi.getSubscription();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/subscription`,
        expect.objectContaining({ method: 'GET' }),
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
      fetchSpy.mockResolvedValue(fakeResponse({
        success: true,
        sessionId: 'order_123',
        url: 'https://square.link/example',
      }));

      const result = await billingApi.createCheckout('starter', 'monthly');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/checkout`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ plan: 'starter', billingCycle: 'monthly' }),
        }),
      );
      expect(result).toBe('https://square.link/example');
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Checkout failed'));

      const result = await billingApi.createCheckout('starter', 'monthly');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createPortal
  // -------------------------------------------------------------------------

  describe('createPortal', () => {
    it('POSTs to /billing/portal and returns URL', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({
        success: true,
        url: 'http://localhost:2800/settings',
      }));

      const result = await billingApi.createPortal();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/portal`,
        expect.objectContaining({ method: 'POST' }),
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
          pdfUrl: 'https://square.com/receipt/1',
        },
      ];
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, invoices }));

      const result = await billingApi.getInvoices();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/billing/invoices`,
        expect.objectContaining({ method: 'GET' }),
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
