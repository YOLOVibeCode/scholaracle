import { adminCustomersApi } from './customers';
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

describe('adminCustomersApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ success: true }));
    mockStorage = {};
    apiClient.setToken(null);

    // Pre-set admin token so useAdminToken=true endpoints include Authorization
    mockStorage['adminToken'] = 'admin-jwt-token';

    // Simulate browser environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = mockLocalStorage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = { cookie: '' };

    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  // -------------------------------------------------------------------------
  // getAll
  // -------------------------------------------------------------------------

  describe('getAll', () => {
    it('builds correct query string with params', async () => {
      const responseBody = { success: true, data: [], total: 0, page: 2, limit: 10 };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      await adminCustomersApi.getAll({
        page: 2,
        limit: 10,
        search: 'john',
        plan: 'pro',
        status: 'active',
      });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/admin/customers?');
      const url = new URL(calledUrl);
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('search')).toBe('john');
      expect(url.searchParams.get('plan')).toBe('pro');
      expect(url.searchParams.get('status')).toBe('active');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });

    it('fetches without query string when no params provided', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: [], total: 0, page: 1, limit: 25 })
      );

      await adminCustomersApi.getAll();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe('getById', () => {
    it('GETs /admin/customers/:id with admin token', async () => {
      const customer = {
        id: 'cust-1',
        email: 'user@test.com',
        name: 'User',
        createdAt: '2024-01-01',
      };
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: customer }));

      const result = await adminCustomersApi.getById('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('cust-1');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('PUTs /admin/customers/:id with correct body and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const updates = { name: 'New Name', phone: '+15555555' };
      await adminCustomersApi.update('cust-1', updates);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('DELETEs /admin/customers/:id with reason in body and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      await adminCustomersApi.delete('cust-1', 'GDPR request');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ reason: 'GDPR request' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // suspend
  // -------------------------------------------------------------------------

  describe('suspend', () => {
    it('POSTs /admin/customers/:id/suspend with reason and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      await adminCustomersApi.suspend('cust-2', 'TOS violation');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-2/suspend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'TOS violation' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // unsuspend
  // -------------------------------------------------------------------------

  describe('unsuspend', () => {
    it('POSTs /admin/customers/:id/unsuspend with empty body and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      await adminCustomersApi.unsuspend('cust-2');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-2/unsuspend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getStudents
  // -------------------------------------------------------------------------

  describe('getStudents', () => {
    it('GETs /admin/customers/:id/students with admin token', async () => {
      const students = [{ id: 's1', userId: 'cust-1', name: 'Student A' }];
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: students }));

      const result = await adminCustomersApi.getStudents('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/students',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(students);
    });
  });

  // -------------------------------------------------------------------------
  // impersonate
  // -------------------------------------------------------------------------

  describe('impersonate', () => {
    it('POSTs /admin/customers/:id/impersonate with reason and admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { token: 'impersonation-jwt' } })
      );

      const result = await adminCustomersApi.impersonate('cust-3', 'Investigating billing issue');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-3/impersonate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Investigating billing issue' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.token).toBe('impersonation-jwt');
    });
  });

  // -------------------------------------------------------------------------
  // getActivity
  // -------------------------------------------------------------------------

  describe('getActivity', () => {
    it('GETs /admin/customers/:id/activity with default limit=50', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminCustomersApi.getActivity('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/activity?limit=50',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
    });

    it('GETs /admin/customers/:id/activity with custom limit', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminCustomersApi.getActivity('cust-1', 10);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/activity?limit=10',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getLtv
  // -------------------------------------------------------------------------

  describe('getLtv', () => {
    it('GETs /admin/customers/:id/ltv with admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { customerId: 'cust-1', ltv: 1200, currency: 'usd' } })
      );

      const result = await adminCustomersApi.getLtv('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/ltv',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.ltv).toBe(1200);
    });
  });

  describe('setPassword', () => {
    it('POSTs /admin/customers/:id/set-password with password and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await adminCustomersApi.setPassword('cust-1', 'NewSecurePass123!');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/set-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ password: 'NewSecurePass123!' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('sendReset', () => {
    it('POSTs /admin/customers/:id/send-reset with admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await adminCustomersApi.sendReset('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/send-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('forceReset', () => {
    it('POSTs /admin/customers/:id/force-reset with admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await adminCustomersApi.forceReset('cust-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-1/force-reset',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        })
      );
      expect(result.success).toBe(true);
    });
  });
});
