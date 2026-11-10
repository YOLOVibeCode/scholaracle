import type { IAccountDeleteResponse } from '@scholaracle/contracts';
import { accountApi } from './account';

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

const BASE = 'http://localhost:2801/api';

describe('accountApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('DELETEs /account with password body', async () => {
    const payload: IAccountDeleteResponse = { success: true };
    fetchSpy.mockResolvedValue(fakeResponse(payload));

    const result = await accountApi.deleteAccount('MyPass123!');

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/account`,
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ password: 'MyPass123!' }),
      })
    );
  });
});
