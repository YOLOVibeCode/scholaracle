import { adminAuthApi } from './auth';
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

describe('adminAuthApi', () => {
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
  // login
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('POSTs to /admin/auth/login and saves token + admin to localStorage on success', async () => {
      const admin = { id: 'a1', email: 'admin@test.com', name: 'Admin', role: 'super_admin' };
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'admin-tok-123', admin }),
      );

      const result = await adminAuthApi.login('admin@test.com', 'secret');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'admin@test.com', password: 'secret' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.token).toBe('admin-tok-123');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('adminToken', 'admin-tok-123');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('adminUser', JSON.stringify(admin));
    });

    it('returns response without saving when no token (requiresMFA)', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, requiresMFA: true, mfaToken: 'mfa-tok' }),
      );

      const result = await adminAuthApi.login('admin@test.com', 'secret');

      expect(result.success).toBe(true);
      expect(result.requiresMFA).toBe(true);
      expect(result.mfaToken).toBe('mfa-tok');
      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('adminToken', expect.anything());
    });
  });

  // -------------------------------------------------------------------------
  // verifyMFA
  // -------------------------------------------------------------------------

  describe('verifyMFA', () => {
    it('POSTs to /admin/auth/mfa/verify and saves token on success', async () => {
      const admin = { id: 'a1', email: 'admin@test.com', name: 'Admin', role: 'admin' };
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'verified-tok', admin }),
      );

      const result = await adminAuthApi.verifyMFA('mfa-tok-abc', '123456');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/mfa/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ mfaToken: 'mfa-tok-abc', token: '123456' }),
        }),
      );
      expect(result.success).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('adminToken', 'verified-tok');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('adminUser', JSON.stringify(admin));
    });
  });

  // -------------------------------------------------------------------------
  // setupMFA
  // -------------------------------------------------------------------------

  describe('setupMFA', () => {
    it('GETs /admin/auth/mfa/setup with admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, secret: 'JBSWY3DPEHPK3PXP', qrCodeUrl: 'https://qr.example.com' }),
      );

      const result = await adminAuthApi.setupMFA();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/mfa/setup',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    });
  });

  // -------------------------------------------------------------------------
  // stepUpStart
  // -------------------------------------------------------------------------

  describe('stepUpStart', () => {
    it('POSTs to /admin/auth/step-up/start with empty body and admin token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { stepUpId: 'su-1', expiresAt: 9999999 } }),
      );

      const result = await adminAuthApi.stepUpStart();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/step-up/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.stepUpId).toBe('su-1');
    });
  });

  // -------------------------------------------------------------------------
  // stepUpVerify
  // -------------------------------------------------------------------------

  describe('stepUpVerify', () => {
    it('POSTs to /admin/auth/step-up/verify with stepUpId and token', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, data: { stepUpToken: 'step-up-jwt', expiresAt: 9999999 } }),
      );

      const result = await adminAuthApi.stepUpVerify('su-1', '654321');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/step-up/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ stepUpId: 'su-1', token: '654321' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.stepUpToken).toBe('step-up-jwt');
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('clears localStorage even if the API call fails', async () => {
      mockStorage['adminToken'] = 'admin-tok';
      mockStorage['adminUser'] = JSON.stringify({ id: 'a1' });
      fetchSpy.mockRejectedValue(new ApiClientError('Server error', 500));

      await expect(adminAuthApi.logout()).rejects.toThrow();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminUser');
      expect(mockStorage['adminToken']).toBeUndefined();
      expect(mockStorage['adminUser']).toBeUndefined();
    });

    it('POSTs to /admin/auth/logout with admin token on success', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      await adminAuthApi.logout();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/auth/logout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminUser');
    });
  });

  // -------------------------------------------------------------------------
  // getToken / getCurrentAdmin / isAuthenticated
  // -------------------------------------------------------------------------

  describe('getToken / getCurrentAdmin / isAuthenticated', () => {
    it('getToken returns adminToken from localStorage', () => {
      mockStorage['adminToken'] = 'tok-from-storage';
      expect(adminAuthApi.getToken()).toBe('tok-from-storage');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('adminToken');
    });

    it('getCurrentAdmin parses adminUser JSON from localStorage', () => {
      const admin = { id: 'a1', email: 'a@b.c', name: 'Admin', role: 'admin' };
      mockStorage['adminUser'] = JSON.stringify(admin);

      const result = adminAuthApi.getCurrentAdmin();

      expect(result).toEqual(admin);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('adminUser');
    });

    it('getCurrentAdmin returns null when no adminUser is stored', () => {
      expect(adminAuthApi.getCurrentAdmin()).toBeNull();
    });

    it('isAuthenticated returns true when token exists', () => {
      mockStorage['adminToken'] = 'some-tok';
      expect(adminAuthApi.isAuthenticated()).toBe(true);
    });

    it('isAuthenticated returns false when no token exists', () => {
      delete mockStorage['adminToken'];
      expect(adminAuthApi.isAuthenticated()).toBe(false);
    });
  });
});
