import { adminAuditLogsApi } from './audit-logs';
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

/**
 * Build a fake Response tailored for CSV export (text/csv content-type,
 * text() returns raw CSV string rather than JSON-serialised body).
 */
function fakeCsvResponse(csvText: string, status = 200): Response {
  const isOk = status >= 200 && status < 300;
  const headers = new Headers({ 'content-type': 'text/csv' });
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve({}),
    headers,
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
    text: () => Promise.resolve(csvText),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/**
 * Build a fake Response for a JSON error on a non-OK status
 * (content-type: application/json so exportCsv's error branch parses it).
 */
function fakeJsonErrorResponse(body: { error?: string; code?: string }, status = 403): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers,
    redirected: false,
    statusText: 'Error',
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

describe('adminAuditLogsApi', () => {
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
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('builds query string from params and GETs /admin/audit-logs', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
      );

      await adminAuditLogsApi.list({
        page: 2,
        limit: 50,
        action: 'USER_CREATED',
        entityType: 'user',
        severity: 'high',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/audit-logs?page=2&limit=50&action=USER_CREATED&entityType=user&severity=high'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns error object when ApiClientError is thrown', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403),
      );

      const result = await adminAuditLogsApi.list();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // exportCsv
  // -------------------------------------------------------------------------

  describe('exportCsv', () => {
    it('calls fetch directly with correct URL and Authorization header', async () => {
      const csv = 'id,action,timestamp\n1,LOGIN,2024-01-01';
      fetchSpy.mockResolvedValue(fakeCsvResponse(csv));

      await adminAuditLogsApi.exportCsv({ action: 'LOGIN' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/audit-logs/export?action=LOGIN',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-tok-123',
          }),
        }),
      );
    });

    it('includes x-admin-stepup header when stepUpToken is provided', async () => {
      const csv = 'id,action\n1,DELETE';
      fetchSpy.mockResolvedValue(fakeCsvResponse(csv));

      await adminAuditLogsApi.exportCsv({}, 'step-up-tok-456');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/audit-logs/export',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-tok-123',
            'x-admin-stepup': 'step-up-tok-456',
          }),
        }),
      );
    });

    it('returns CSV text on success', async () => {
      const csv = 'id,action,timestamp\n1,LOGIN,2024-01-01\n2,LOGOUT,2024-01-02';
      fetchSpy.mockResolvedValue(fakeCsvResponse(csv));

      const result = await adminAuditLogsApi.exportCsv();

      expect(result.success).toBe(true);
      expect(result.data).toBe(csv);
    });
  });
});
