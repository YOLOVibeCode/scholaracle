import { adminCommunicationsApi } from './communications';
import { apiClient, ApiClientError } from '../client';

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

describe('adminCommunicationsApi', () => {
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
  // listLogs
  // -------------------------------------------------------------------------

  describe('listLogs', () => {
    it('builds query string from params', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: [], total: 0 }),
      );

      await adminCommunicationsApi.listLogs({
        userId: 'u1',
        recipientEmail: 'a@b.c',
        status: 'sent',
        channel: 'email',
        type: 'notification',
        page: 2,
        limit: 25,
      });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/admin/communications/logs?');
      const url = new URL(calledUrl);
      expect(url.searchParams.get('userId')).toBe('u1');
      expect(url.searchParams.get('recipientEmail')).toBe('a@b.c');
      expect(url.searchParams.get('status')).toBe('sent');
      expect(url.searchParams.get('channel')).toBe('email');
      expect(url.searchParams.get('type')).toBe('notification');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('25');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
    });

    it('fetches without query string when no params provided', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: [] }));

      await adminCommunicationsApi.listLogs();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/logs',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendEmail
  // -------------------------------------------------------------------------

  describe('sendEmail', () => {
    it('POSTs /admin/communications/send with payload and admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { id: 'comm-1' } }),
      );

      const payload = { recipientEmail: 'user@test.com', subject: 'Hello', content: '<p>Hi</p>' };
      const result = await adminCommunicationsApi.sendEmail(payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('comm-1');
    });
  });

  // -------------------------------------------------------------------------
  // listTemplates
  // -------------------------------------------------------------------------

  describe('listTemplates', () => {
    it('GETs /admin/communications/templates with admin token', async () => {
      const templates = [{ id: 't1', name: 'Welcome', channel: 'email', type: 'notification', subject: 'Welcome!', content: 'Hi', isActive: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' }];
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: templates }));

      const result = await adminCommunicationsApi.listTemplates();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/templates',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(templates);
    });
  });

  // -------------------------------------------------------------------------
  // createTemplate
  // -------------------------------------------------------------------------

  describe('createTemplate', () => {
    it('POSTs /admin/communications/templates with payload and admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { id: 'tpl-new' } }),
      );

      const payload = { name: 'Reset Password', channel: 'email' as const, type: 'system' as const, subject: 'Reset your password', content: '<p>Click here</p>' };
      const result = await adminCommunicationsApi.createTemplate(payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/templates',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('tpl-new');
    });
  });

  // -------------------------------------------------------------------------
  // updateTemplate
  // -------------------------------------------------------------------------

  describe('updateTemplate', () => {
    it('PUTs /admin/communications/templates/:id with payload and admin token', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const payload = { subject: 'Updated Subject', isActive: false };
      await adminCommunicationsApi.updateTemplate('tpl-1', payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/templates/tpl-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // bulkSend
  // -------------------------------------------------------------------------

  describe('bulkSend', () => {
    it('POSTs /admin/communications/bulk-send without stepUpToken via post()', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { batchId: 'batch-1' } }),
      );

      const payload = { criteria: { role: 'user' }, subject: 'Announcement', content: 'Hello all' };
      const result = await adminCommunicationsApi.bulkSend(payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/bulk-send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.batchId).toBe('batch-1');
    });

    it('sends x-admin-stepup header via request() when stepUpToken is provided', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { batchId: 'batch-2' } }),
      );

      const payload = { criteria: { emails: ['a@b.c'] }, subject: 'Targeted', content: 'Hey' };
      const result = await adminCommunicationsApi.bulkSend(payload, 'step-up-jwt-xyz');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/bulk-send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
            'x-admin-stepup': 'step-up-jwt-xyz',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.batchId).toBe('batch-2');
    });

    it('returns error object on ApiClientError instead of throwing', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ error: 'Step-up required', code: 'STEP_UP_REQUIRED' }, 403));

      const payload = { criteria: { role: 'user' }, subject: 'Test', content: 'x' };
      const result = await adminCommunicationsApi.bulkSend(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listBatches
  // -------------------------------------------------------------------------

  describe('listBatches', () => {
    it('GETs /admin/communications/batches with admin token', async () => {
      const batches = [{ id: 'b1', status: 'completed', criteria: {}, subject: 'Hi', totalRecipients: 100, sentCount: 100, failedCount: 0, createdAt: '2024-01-01' }];
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: batches }));

      const result = await adminCommunicationsApi.listBatches();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/batches',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(batches);
    });

    it('returns error object on failure instead of throwing', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, 403));

      const result = await adminCommunicationsApi.listBatches();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getAnalytics
  // -------------------------------------------------------------------------

  describe('getAnalytics', () => {
    it('GETs /admin/communications/analytics with default days=30', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { days: 30, total: 500, sent: 490, delivered: 480 } }),
      );

      const result = await adminCommunicationsApi.getAnalytics();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/analytics?days=30',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.days).toBe(30);
    });

    it('GETs /admin/communications/analytics with custom days param', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { days: 7, total: 100 } }),
      );

      await adminCommunicationsApi.getAnalytics(7);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/communications/analytics?days=7',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });
});
