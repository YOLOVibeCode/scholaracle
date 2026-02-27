import { adminAnalyticsApi } from './analytics';
import { apiClient } from '../client';

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
// Mocks
// ---------------------------------------------------------------------------

let mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: jest.fn((key: string) => mockStorage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: jest.fn(() => {
    mockStorage = {};
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: jest.fn(() => null),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('adminAnalyticsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ success: true }));
    mockStorage = { adminToken: 'admin-tok-123' };
    apiClient.setToken(null);

    // Simulate browser environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = mockLocalStorage;

    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  // -------------------------------------------------------------------------
  // getOverview
  // -------------------------------------------------------------------------

  describe('getOverview', () => {
    it('GETs /admin/analytics/overview with admin token', async () => {
      const overview = {
        success: true,
        data: {
          mrr: 5000,
          churnRate: 2.5,
          arpu: 25,
          totalCustomers: 200,
          activeCustomers: 180,
          newCustomers: 15,
        },
      };
      fetchSpy.mockResolvedValue(fakeResponse(overview));

      const result = await adminAnalyticsApi.getOverview();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/analytics/overview'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(overview);
    });
  });

  // -------------------------------------------------------------------------
  // getRevenue
  // -------------------------------------------------------------------------

  describe('getRevenue', () => {
    it('builds query string with period params', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminAnalyticsApi.getRevenue({
        period: 'month',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '/admin/analytics/revenue?period=month&startDate=2024-01-01&endDate=2024-12-31'
        ),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('GETs without query string when no params are provided', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminAnalyticsApi.getRevenue();

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toMatch(/\/admin\/analytics\/revenue$/);
      expect(url).not.toContain('?');
    });
  });

  // -------------------------------------------------------------------------
  // getCustomerGrowth
  // -------------------------------------------------------------------------

  describe('getCustomerGrowth', () => {
    it('includes months param in query string', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminAnalyticsApi.getCustomerGrowth({ period: 'month', months: 6 });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/analytics/customers?period=month&months=6'),
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getChurnRate
  // -------------------------------------------------------------------------

  describe('getChurnRate', () => {
    it('GETs /admin/analytics/churn with admin token', async () => {
      const churnData = { success: true, data: { churnRate: 3.2 } };
      fetchSpy.mockResolvedValue(fakeResponse(churnData));

      const result = await adminAnalyticsApi.getChurnRate();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/analytics/churn'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(churnData);
    });
  });
});
