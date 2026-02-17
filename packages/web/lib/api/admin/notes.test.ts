import { adminNotesApi } from './notes';

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

describe('adminNotesApi', () => {
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
  // getByCustomerId
  // -------------------------------------------------------------------------

  describe('getByCustomerId', () => {
    it('GETs the correct endpoint with customer id', async () => {
      await adminNotesApi.getByCustomerId('cust-abc-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-abc-123/notes',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('POSTs with note body to customer notes endpoint', async () => {
      const note = { content: 'VIP customer, handle with care', category: 'general' as const, isInternal: true };
      await adminNotesApi.create('cust-abc-123', note);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/customers/cust-abc-123/notes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(note),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('PUTs with updates to note endpoint', async () => {
      const updates = { content: 'Updated note content', category: 'billing' as const };
      await adminNotesApi.update('note-xyz-789', updates);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/notes/note-xyz-789',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('DELETEs the correct endpoint', async () => {
      await adminNotesApi.delete('note-xyz-789');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/notes/note-xyz-789',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({}),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // togglePin
  // -------------------------------------------------------------------------

  describe('togglePin', () => {
    it('POSTs to pin endpoint with empty body', async () => {
      await adminNotesApi.togglePin('note-xyz-789');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:2801/api/admin/notes/note-xyz-789/pin',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
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

      await adminNotesApi.getByCustomerId('cust-1');

      const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer admin-jwt-test');
    });
  });
});
