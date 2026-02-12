import { postJson, getJson } from './http';

describe('postJson', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('sends POST with JSON body and content-type header', async () => {
    const responseBody = { id: 1, name: 'test' };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    });

    const result = await postJson<typeof responseBody>('https://api.example.com/data', {
      foo: 'bar',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/data');
    expect(options.method).toBe('POST');
    expect(options.headers['content-type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ foo: 'bar' }));
    expect(result).toEqual(responseBody);
  });

  it('includes Bearer token when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    });

    await postJson('https://api.example.com/data', { x: 1 }, 'my-secret-token');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.authorization).toBe('Bearer my-secret-token');
  });

  it('throws on non-ok response with JSON error body', async () => {
    const errorBody = { error: 'Bad Request', message: 'Invalid field' };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve(JSON.stringify(errorBody)),
    });

    await expect(postJson('https://api.example.com/data', {})).rejects.toThrow(
      'HTTP 400 Bad Request'
    );

    await expect(postJson('https://api.example.com/data', {})).rejects.toThrow(
      JSON.stringify(errorBody)
    );
  });

  it('does not include authorization header when token is omitted', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    });

    await postJson('https://api.example.com/data', { x: 1 });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.authorization).toBeUndefined();
  });

  it('serializes null body as empty object', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    });

    await postJson('https://api.example.com/data', null);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify({}));
  });

  it('handles empty response body on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: () => Promise.resolve(''),
    });

    const result = await postJson('https://api.example.com/data', {});

    expect(result).toBeUndefined();
  });

  it('handles non-JSON response body on error', async () => {
    const plainText = 'Internal Server Error: something went wrong';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(plainText),
    });

    await expect(postJson('https://api.example.com/data', {})).rejects.toThrow(
      'HTTP 500 Internal Server Error'
    );

    await expect(postJson('https://api.example.com/data', {})).rejects.toThrow(plainText);
  });
});

describe('getJson', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('sends GET request and returns parsed JSON with headers', async () => {
    const responseBody = [{ id: 1, name: 'Course 1' }];
    const mockHeaders = new Headers({ 'x-total': '1' });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responseBody),
      headers: mockHeaders,
    });

    const result = await getJson<typeof responseBody>('https://api.example.com/courses');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/courses');
    expect(options.method).toBe('GET');
    expect(result.data).toEqual(responseBody);
    expect(result.headers).toBe(mockHeaders);
  });

  it('includes Bearer token when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });

    await getJson('https://api.example.com/data', 'my-token');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.authorization).toBe('Bearer my-token');
  });

  it('does not include authorization header when token is omitted', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });

    await getJson('https://api.example.com/data');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.authorization).toBeUndefined();
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Resource not found'),
    });

    await expect(getJson('https://api.example.com/missing')).rejects.toThrow('HTTP 404 Not Found');
  });
});
