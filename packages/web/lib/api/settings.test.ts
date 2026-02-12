import { settingsApi, type IUserSettings } from './settings';

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

const DEFAULT_SETTINGS: IUserSettings = {
  notifications: {
    push: true,
    email: true,
    sms: false,
  },
  alerts: {
    gradeDrop: 5,
    daysBeforeDeadline: 2,
    lowGradeThreshold: 80,
  },
};

describe('settingsApi', () => {
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
  // get
  // -------------------------------------------------------------------------

  describe('get', () => {
    it('GETs /settings and returns the user settings', async () => {
      const serverSettings: IUserSettings = {
        notifications: { push: false, email: true, sms: true },
        alerts: { gradeDrop: 10, daysBeforeDeadline: 3, lowGradeThreshold: 70 },
      };
      fetchSpy.mockResolvedValue(fakeResponse(serverSettings));

      const result = await settingsApi.get();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/settings`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(serverSettings);
    });

    it('returns default settings when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Server error'));

      const result = await settingsApi.get();

      expect(result).toEqual(DEFAULT_SETTINGS);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('PUTs to /settings with the settings body and returns true on success', async () => {
      const updatedSettings: IUserSettings = {
        notifications: { push: true, email: false, sms: true },
        alerts: { gradeDrop: 8, daysBeforeDeadline: 1, lowGradeThreshold: 75 },
      };
      fetchSpy.mockResolvedValue(fakeResponse(updatedSettings));

      const result = await settingsApi.update({
        notifications: { push: true, email: false, sms: true },
        alerts: { gradeDrop: 8, daysBeforeDeadline: 1, lowGradeThreshold: 75 },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/settings`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            notifications: { push: true, email: false, sms: true },
            alerts: { gradeDrop: 8, daysBeforeDeadline: 1, lowGradeThreshold: 75 },
          }),
        }),
      );
      expect(result).toBe(true);
    });

    it('returns false when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Update failed'));

      const result = await settingsApi.update({
        notifications: { push: false },
      });

      expect(result).toBe(false);
    });
  });
});
