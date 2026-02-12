import { alertsApi, type IAlert } from './alerts';

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
// Test suite
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000/api';

describe('alertsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // getAll
  // -------------------------------------------------------------------------

  describe('getAll', () => {
    it('GETs /alerts-api and returns the alerts array', async () => {
      const alerts: IAlert[] = [
        {
          id: 'a1',
          studentId: 's1',
          type: 'grade_drop',
          severity: 'high',
          message: 'Grade dropped by 10%',
          createdAt: '2025-01-15T10:00:00Z',
          acknowledged: false,
        },
        {
          id: 'a2',
          studentId: 's2',
          type: 'missing_assignment',
          severity: 'medium',
          message: 'Missing assignment: Math HW 5',
          createdAt: '2025-01-14T08:00:00Z',
          acknowledged: true,
        },
      ];
      fetchSpy.mockResolvedValue(fakeResponse(alerts));

      const result = await alertsApi.getAll();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/alerts-api`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(alerts);
    });

    it('returns an empty array when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await alertsApi.getAll();

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // acknowledge
  // -------------------------------------------------------------------------

  describe('acknowledge', () => {
    it('POSTs to /alerts-api/:id/acknowledge and returns true on success', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await alertsApi.acknowledge('a1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/alerts-api/a1/acknowledge`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );
      expect(result).toBe(true);
    });

    it('throws when the network request fails (no try-catch wrapping)', async () => {
      fetchSpy.mockRejectedValue(new Error('Network failure'));

      await expect(alertsApi.acknowledge('a1')).rejects.toThrow('Network failure');
    });
  });
});
