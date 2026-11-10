import { sourcesApi } from './sources';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';

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

describe('sourcesApi.triggerSync', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('treats HTTP 202 as success and returns the trigger body', async () => {
    const body = {
      message: 'Open Scholarmancy on your phone to sync',
      syncRequestId: 'req-1',
      studentId: 'stu-1',
      sourceId: 'src-1',
      createdAt: '2026-03-10T12:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(fakeResponse(body, 202));

    const result = await sourcesApi.triggerSync('stu-1', 'src-1');

    expect(result).toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE}/students/stu-1/sources/src-1/runs/trigger`,
      expect.objectContaining({ method: 'POST' })
    );
  });
});
