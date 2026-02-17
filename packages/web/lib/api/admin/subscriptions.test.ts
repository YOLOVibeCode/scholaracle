import { adminSubscriptionsApi } from './subscriptions';

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
// Mocks
// ---------------------------------------------------------------------------

let mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: jest.fn((key: string) => mockStorage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockStorage[key]; }),
  clear: jest.fn(() => { mockStorage = {}; }),
  get length() { return Object.keys(mockStorage).length; },
  key: jest.fn(() => null),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('adminSubscriptionsApi', () => {
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
      await adminSubscriptionsApi.list({ userId: 'u1', status: 'active', plan: 'premium' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/subscriptions?'),
        expect.objectContaining({ method: 'GET' }),
      );

      const url = fetchSpy.mock.calls[0][0] as string;
      const qs = new URL(url).searchParams;
      expect(qs.get('userId')).toBe('u1');
      expect(qs.get('status')).toBe('active');
      expect(qs.get('plan')).toBe('premium');
    });

    it('fetches without query string when no params are provided', async () => {
      await adminSubscriptionsApi.list();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe('getById', () => {
    it('GETs the correct endpoint with subscription id', async () => {
      await adminSubscriptionsApi.getById('sub-abc-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions/sub-abc-123',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getByUserId
  // -------------------------------------------------------------------------

  describe('getByUserId', () => {
    it('includes userId in the query string', async () => {
      await adminSubscriptionsApi.getByUserId('user-42');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions?userId=user-42',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // changePlan
  // -------------------------------------------------------------------------

  describe('changePlan', () => {
    it('PUTs with plan in request body', async () => {
      await adminSubscriptionsApi.changePlan('user-42', 'enterprise');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions/user-42/plan',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ plan: 'enterprise' }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('POSTs with reason in request body', async () => {
      await adminSubscriptionsApi.cancel('user-42', 'Customer requested cancellation');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions/user-42/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Customer requested cancellation' }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // extendTrial
  // -------------------------------------------------------------------------

  describe('extendTrial', () => {
    it('POSTs with days and reason in request body', async () => {
      const request = { days: 14, reason: 'Courtesy extension for onboarding delay' };
      await adminSubscriptionsApi.extendTrial('user-42', request);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/subscriptions/user-42/extend-trial',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Admin token usage
  // -------------------------------------------------------------------------

  describe('admin token', () => {
    it('sends Authorization header with adminToken from localStorage', async () => {
      mockStorage['adminToken'] = 'admin-jwt-test';

      await adminSubscriptionsApi.list();

      const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer admin-jwt-test');
    });
  });
});
