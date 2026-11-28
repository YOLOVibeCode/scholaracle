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

const BASE = 'http://localhost:2801/api';

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
    prioritizeHighImpact: true,
    emphasizeWeakSubjects: true,
    celebrateWins: true,
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
      // get() merges with defaults, so result has server values plus default alert booleans
      expect(result.notifications).toMatchObject(serverSettings.notifications as object);
      expect(result.alerts).toMatchObject(serverSettings.alerts as object);
      expect(result.alerts?.prioritizeHighImpact).toBe(true);
      expect(result.alerts?.emphasizeWeakSubjects).toBe(true);
      expect(result.alerts?.celebrateWins).toBe(true);
    });

    it('returns default settings when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Server error'));

      const result = await settingsApi.get();

      expect(result).toMatchObject(DEFAULT_SETTINGS);
    });
  });

  // -------------------------------------------------------------------------
  // load: for a page that saves what it shows
  // -------------------------------------------------------------------------

  describe('load', () => {
    it('GETs /settings and fills what the server left out with the defaults', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({
          notifications: { push: false, email: true, sms: true },
          alerts: { gradeDrop: 10, daysBeforeDeadline: 3, lowGradeThreshold: 70 },
          profile: { name: 'A Parent', email: 'parent@example.com', phone: '+15125550100', smsConsent: true },
        }),
      );

      const result = await settingsApi.load();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/settings`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.notifications).toMatchObject({ push: false, email: true, sms: true });
      expect(result.alerts).toMatchObject({ gradeDrop: 10, celebrateWins: true });
      expect(result.profile).toMatchObject({ phone: '+15125550100', smsConsent: true });
    });

    it('fails when the request fails: defaults are not what the person saved', async () => {
      fetchSpy.mockRejectedValue(new Error('Server error'));

      await expect(settingsApi.load()).rejects.toThrow();
    });

    it('fails when the server answers with an error', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ error: 'Internal error' }, 500));

      await expect(settingsApi.load()).rejects.toThrow();
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
