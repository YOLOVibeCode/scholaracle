import { authApi } from './auth';
import { apiClient, ApiClientError } from './client';

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

describe('authApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ success: true }));
    mockStorage = {};
    apiClient.setToken(null);

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
    it('POSTs to /auth/login with email and password', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'tok-123', user: { id: '1', email: 'a@b.c', name: 'A' } }),
      );

      await authApi.login('a@b.c', 'pass');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.c', password: 'pass', rememberMe: true }),
        }),
      );
    });

    it('saves token to apiClient and localStorage on success', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'tok-123', user: { id: '1', email: 'a@b.c', name: 'A' } }),
      );

      const result = await authApi.login('a@b.c', 'pass');

      expect(result.success).toBe(true);
      expect(result.token).toBe('tok-123');
      expect(apiClient.getToken()).toBe('tok-123');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'tok-123');
    });

    it('returns error response on failure (does not throw)', async () => {
      fetchSpy.mockRejectedValue(new ApiClientError('Invalid credentials', 401));

      const result = await authApi.login('bad@b.c', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(apiClient.getToken()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('POSTs to /auth/register with email, password, and name', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'reg-tok', user: { id: '2', email: 'b@c.d', name: 'B' } }),
      );

      await authApi.register('b@c.d', 'pass', 'B');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'b@c.d', password: 'pass', name: 'B', rememberMe: true }),
        }),
      );
    });

    it('saves token on successful registration', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ success: true, token: 'reg-tok', user: { id: '2', email: 'b@c.d', name: 'B' } }),
      );

      const result = await authApi.register('b@c.d', 'pass', 'B');

      expect(result.success).toBe(true);
      expect(apiClient.getToken()).toBe('reg-tok');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'reg-tok');
    });

    it('returns error response on failure (does not throw)', async () => {
      fetchSpy.mockRejectedValue(new Error('Email in use'));

      const result = await authApi.register('dup@b.c', 'pass', 'C');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email in use');
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('clears token from apiClient and localStorage', async () => {
      apiClient.setToken('existing-token');
      mockStorage['auth_token'] = 'existing-token';

      await authApi.logout();

      expect(apiClient.getToken()).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  // -------------------------------------------------------------------------
  // getToken
  // -------------------------------------------------------------------------

  describe('getToken', () => {
    it('returns current token from apiClient', () => {
      expect(authApi.getToken()).toBeNull();
      apiClient.setToken('tok-abc');
      expect(authApi.getToken()).toBe('tok-abc');
    });
  });

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('restores token from localStorage', () => {
      mockStorage['auth_token'] = 'stored-tok';

      authApi.initialize();

      expect(apiClient.getToken()).toBe('stored-tok');
    });

    it('does nothing when no stored token', () => {
      authApi.initialize();
      expect(apiClient.getToken()).toBeNull();
    });
  });
});
