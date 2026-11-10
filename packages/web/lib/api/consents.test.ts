import { consentsApi } from './consents';

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

describe('consentsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ serverAi: false }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('get() loads serverAi from the API', async () => {
    fetchSpy.mockResolvedValue(fakeResponse({ serverAi: true }));
    const result = await consentsApi.get();
    expect(result.serverAi).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/consents'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('setServerAi() PUTs enabled flag', async () => {
    await consentsApi.setServerAi(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/consents/server-ai'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      })
    );
  });
});
