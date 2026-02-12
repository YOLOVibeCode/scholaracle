import { agendaApi } from './agenda';

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

describe('agendaApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // getRange
  // -------------------------------------------------------------------------

  describe('getRange', () => {
    it('GETs /agenda with encoded from and to query params', async () => {
      const fromIso = '2025-01-01T00:00:00.000Z';
      const toIso = '2025-01-08T00:00:00.000Z';
      const responseBody = {
        success: true,
        data: {
          items: [
            {
              id: 'item-1',
              type: 'assignment',
              title: 'Math HW 5',
              timeAt: '2025-01-03T23:59:00Z',
              courseExternalId: 'MATH101',
              courseName: 'Algebra I',
            },
          ],
        },
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await agendaApi.getRange(fromIso, toIso);

      const expectedUrl = `${BASE}/agenda?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
      expect(fetchSpy).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(responseBody);
    });

    it('returns the full IApiResponse structure from the server', async () => {
      const responseBody = {
        success: true,
        data: { items: [] },
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await agendaApi.getRange(
        '2025-06-01T00:00:00Z',
        '2025-06-08T00:00:00Z',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ items: [] });
    });
  });

  // -------------------------------------------------------------------------
  // snooze
  // -------------------------------------------------------------------------

  describe('snooze', () => {
    it('POSTs to /agenda/snooze with the params body', async () => {
      const params = {
        itemType: 'assignment' as const,
        itemKey: 'hw-5',
        snoozedUntil: '2025-01-10T08:00:00Z',
        scope: 'occurrence' as const,
      };
      const responseBody = {
        success: true,
        data: { snoozedUntil: '2025-01-10T08:00:00Z' },
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await agendaApi.snooze(params);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/agenda/snooze`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(params),
        }),
      );
      expect(result).toEqual(responseBody);
    });

    it('returns the snoozedUntil value in the response data', async () => {
      const responseBody = {
        success: true,
        data: { snoozedUntil: '2025-02-01T12:00:00Z' },
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await agendaApi.snooze({
        itemType: 'event_occurrence',
        itemKey: 'evt-3',
        snoozedUntil: '2025-02-01T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(result.data?.snoozedUntil).toBe('2025-02-01T12:00:00Z');
    });
  });
});
