import { adminPaymentsApi } from './payments';

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

describe('adminPaymentsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ success: true }));
    mockStorage = { adminToken: 'admin-jwt-test' };

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
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('builds query string from params', async () => {
      await adminPaymentsApi.list({ status: 'succeeded', userId: 'user-99' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/payments?'),
        expect.objectContaining({ method: 'GET' })
      );

      const url = fetchSpy.mock.calls[0][0] as string;
      const qs = new URL(url).searchParams;
      expect(qs.get('status')).toBe('succeeded');
      expect(qs.get('userId')).toBe('user-99');
    });

    it('fetches without query string when no params are provided', async () => {
      await adminPaymentsApi.list();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/payments',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getByUserId
  // -------------------------------------------------------------------------

  describe('getByUserId', () => {
    it('includes userId in the query string', async () => {
      await adminPaymentsApi.getByUserId('user-55');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/payments?userId=user-55',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // refund
  // -------------------------------------------------------------------------

  describe('refund', () => {
    it('POSTs with amount and reason in request body', async () => {
      const request = { amount: 29.99, reason: 'Duplicate charge' };
      await adminPaymentsApi.refund('pay-abc-123', request);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/payments/pay-abc-123/refund',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // retry
  // -------------------------------------------------------------------------

  describe('retry', () => {
    it('POSTs with empty body', async () => {
      await adminPaymentsApi.retry('pay-xyz-789');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/payments/pay-xyz-789/retry',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Admin token usage
  // -------------------------------------------------------------------------

  describe('admin token', () => {
    it('sends Authorization header with adminToken from localStorage', async () => {
      mockStorage['adminToken'] = 'admin-jwt-test';

      await adminPaymentsApi.list();

      const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer admin-jwt-test');
    });
  });
});
