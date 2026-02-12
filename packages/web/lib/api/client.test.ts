import { ApiClient, ApiClientError } from './client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that `fetch` would return. */
function fakeResponse(
  body: unknown,
  status = 200,
  ok?: boolean,
): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: isOk ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => fakeResponse(body, status, isOk),
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
// Test suite
// ---------------------------------------------------------------------------

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new ApiClient('https://api.test');
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ ok: true }));

    // Simulate a non-browser environment (no window.localStorage)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // URL construction
  // -------------------------------------------------------------------------

  it('constructs GET request with correct URL', async () => {
    await client.get('/users');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/users',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('constructs POST request with correct URL and body', async () => {
    const payload = { name: 'Alice' };
    await client.post('/users', payload);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('constructs PUT request with correct URL and body', async () => {
    const payload = { name: 'Bob' };
    await client.put('/users/1', payload);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/users/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    );
  });

  it('constructs DELETE request with correct URL', async () => {
    await client.delete('/users/1');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/users/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('DELETE sends body when provided', async () => {
    const payload = { reason: 'test' };
    await client.delete('/users/1', payload);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/users/1',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify(payload),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Headers
  // -------------------------------------------------------------------------

  it('sends Content-Type application/json by default', async () => {
    await client.get('/test');
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends Authorization header when token is set', async () => {
    client.setToken('my-jwt');
    await client.get('/test');
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-jwt');
  });

  it('does not send Authorization header when no token', async () => {
    await client.get('/test');
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Admin token mode
  // -------------------------------------------------------------------------

  it('reads adminToken from localStorage when useAdminToken is true', async () => {
    // Simulate browser with localStorage
    const mockStorage: Record<string, string> = { adminToken: 'admin-jwt-123' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
    };

    await client.get('/admin/data', true);
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer admin-jwt-123');
  });

  // -------------------------------------------------------------------------
  // Response parsing
  // -------------------------------------------------------------------------

  it('parses JSON response body', async () => {
    const responseData = { id: 1, name: 'Alice' };
    fetchSpy.mockResolvedValue(fakeResponse(responseData));

    const result = await client.get<{ id: number; name: string }>('/users/1');
    expect(result).toEqual(responseData);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('throws ApiClientError on non-OK response with JSON error body', async () => {
    fetchSpy.mockResolvedValue(
      fakeResponse({ success: false, error: 'Not found', code: 'NOT_FOUND' }, 404),
    );

    await expect(client.get('/missing')).rejects.toThrow(ApiClientError);
    try {
      await client.get('/missing');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.message).toBe('Not found');
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
    }
  });

  it('throws ApiClientError with HTTP status when error body is not JSON', async () => {
    const badResponse = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
      headers: new Headers(),
      redirected: false,
      statusText: 'Error',
      type: 'basic' as ResponseType,
      url: '',
      clone: () => badResponse,
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      text: () => Promise.resolve(''),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    fetchSpy.mockResolvedValue(badResponse);

    await expect(client.get('/broken')).rejects.toThrow(ApiClientError);
    try {
      await client.get('/broken');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.message).toBe('HTTP 500');
      expect(apiErr.status).toBe(500);
    }
  });

  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  it('getToken returns null initially', () => {
    expect(client.getToken()).toBeNull();
  });

  it('setToken / getToken round-trips', () => {
    client.setToken('abc');
    expect(client.getToken()).toBe('abc');
    client.setToken(null);
    expect(client.getToken()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Custom request method
  // -------------------------------------------------------------------------

  it('request() forwards arbitrary options', async () => {
    await client.request('/custom', { method: 'PATCH', body: '{}' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test/custom',
      expect.objectContaining({ method: 'PATCH', body: '{}' }),
    );
  });
});
