import { adminUsersApi } from './users';
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

describe('adminUsersApi', () => {
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
    it('GETs /admin/users with admin token', async () => {
      const usersData = {
        success: true,
        data: [
          {
            id: '1',
            email: 'admin@test.com',
            name: 'Admin',
            role: 'admin',
            isActive: true,
            mfaEnabled: true,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      };
      fetchSpy.mockResolvedValue(fakeResponse(usersData));

      const result = await adminUsersApi.list();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(usersData);
    });

    it('returns error object on failure', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
      );

      const result = await adminUsersApi.list();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    const payload = {
      email: 'new@test.com',
      name: 'New Admin',
      role: 'admin' as const,
      password: 'securePass123',
    };

    it('POSTs to /admin/users with payload (no stepUpToken)', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: { id: 'new-1' } }));

      const result = await adminUsersApi.create(payload);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'new-1' });
    });

    it('sends x-admin-stepup header when stepUpToken is provided', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, data: { id: 'new-2' } }));

      await adminUsersApi.create(payload, 'step-up-tok-789');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            'x-admin-stepup': 'step-up-tok-789',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    const userId = 'user-42';
    const payload = { name: 'Updated Name', role: 'admin' as const };

    it('PUTs to /admin/users/:id with payload and optional stepUpToken', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      await adminUsersApi.update(userId, payload, 'step-up-tok-abc');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(`/admin/users/${userId}`),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            'x-admin-stepup': 'step-up-tok-abc',
          }),
        })
      );
    });
  });
});
