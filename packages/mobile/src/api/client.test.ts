/**
 * ScholarmancyApiClient tests — auth token handling, refresh rotation, 401 retry.
 * Guards against the production login failure where the API returns `token`
 * but the client expected `accessToken`.
 */

import * as SecureStore from 'expo-secure-store';
import { ScholarmancyApiClient } from './client';

const BASE_URL = 'https://api.test.local';

/** In-memory SecureStore backing for round-trip assertions. */
const secureStoreData = new Map<string, string>();

function wireSecureStoreMock(): void {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    return secureStoreData.get(key) ?? null;
  });
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    if (typeof value !== 'string') {
      throw new Error(`SecureStore value for ${key} must be a string, got ${typeof value}`);
    }
    secureStoreData.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secureStoreData.delete(key);
  });
}

interface IMockResponseSpec {
  readonly status: number;
  readonly body: unknown;
}

function makeResponse(spec: IMockResponseSpec): Response {
  return {
    ok: spec.status >= 200 && spec.status < 300,
    status: spec.status,
    statusText: String(spec.status),
    json: async () => spec.body,
    text: async () => JSON.stringify(spec.body),
  } as unknown as Response;
}

/** Queue-based fetch mock: each call consumes the next response. */
function mockFetchSequence(...specs: IMockResponseSpec[]): jest.Mock {
  const fetchMock = jest.fn();
  for (const spec of specs) {
    fetchMock.mockResolvedValueOnce(makeResponse(spec));
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Realistic production login response (field is `token`, NOT `accessToken`). */
function makeLoginBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    success: true,
    token: 'jwt-access-token-1',
    refreshToken: 'refresh-token-1',
    familyId: 'fam-1',
    rememberMe: true,
    user: { id: 'user-1', email: 'demo@scholarmancy.com', name: 'Demo Family' },
    forcePasswordReset: false,
    ...overrides,
  };
}

describe('ScholarmancyApiClient auth', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    wireSecureStoreMock();
    client = new ScholarmancyApiClient(BASE_URL);
  });

  describe('login', () => {
    it('should store the access token from the `token` field of the API response', async () => {
      mockFetchSequence({ status: 200, body: makeLoginBody() });

      await client.login('demo@scholarmancy.com', 'pw');

      expect(secureStoreData.get('slc_access_token')).toBe('jwt-access-token-1');
      expect(secureStoreData.get('slc_refresh_token')).toBe('refresh-token-1');
    });

    it('should also accept a legacy `accessToken` field', async () => {
      mockFetchSequence({
        status: 200,
        body: makeLoginBody({ token: undefined, accessToken: 'jwt-legacy' }),
      });

      await client.login('demo@scholarmancy.com', 'pw');

      expect(secureStoreData.get('slc_access_token')).toBe('jwt-legacy');
    });

    it('should throw a readable error when the response has no token', async () => {
      mockFetchSequence({
        status: 200,
        body: { success: false },
      });

      await expect(client.login('demo@scholarmancy.com', 'pw')).rejects.toThrow(/token/i);
      expect(secureStoreData.has('slc_access_token')).toBe(false);
    });

    it('should throw the server error body on a failed login', async () => {
      mockFetchSequence({
        status: 401,
        body: { success: false, error: 'Invalid email or password' },
      });

      await expect(client.login('demo@scholarmancy.com', 'wrong')).rejects.toThrow(
        /Invalid email or password/
      );
    });
  });

  describe('token refresh', () => {
    it('should refresh using the `token` field and store the rotated refresh token', async () => {
      // No access token stored; only a refresh token.
      secureStoreData.set('slc_refresh_token', 'refresh-token-old');
      const fetchMock = mockFetchSequence(
        // refresh call
        {
          status: 200,
          body: { success: true, token: 'jwt-new', refreshToken: 'refresh-token-rotated' },
        },
        // actual GET
        { status: 200, body: [] }
      );

      await client.getStudents();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/auth/refresh`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(secureStoreData.get('slc_access_token')).toBe('jwt-new');
      expect(secureStoreData.get('slc_refresh_token')).toBe('refresh-token-rotated');
    });

    it('should retry a GET once after a 401 by refreshing the access token', async () => {
      secureStoreData.set('slc_access_token', 'jwt-expired');
      secureStoreData.set('slc_refresh_token', 'refresh-token-old');
      const fetchMock = mockFetchSequence(
        // first GET → 401 (expired token)
        { status: 401, body: { error: 'Unauthorized' } },
        // refresh
        { status: 200, body: { success: true, token: 'jwt-fresh', refreshToken: 'rt-2' } },
        // retried GET
        { status: 200, body: [{ _id: 's1', name: 'Emma', externalId: 'stu-1' }] }
      );

      const students = await client.getStudents();

      expect(students).toEqual([{ _id: 's1', name: 'Emma', externalId: 'stu-1' }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(secureStoreData.get('slc_access_token')).toBe('jwt-fresh');
    });

    it('should surface a session-expired error when the refresh itself fails', async () => {
      secureStoreData.set('slc_access_token', 'jwt-expired');
      secureStoreData.set('slc_refresh_token', 'refresh-token-dead');
      mockFetchSequence(
        { status: 401, body: { error: 'Unauthorized' } },
        { status: 401, body: { error: 'Invalid refresh token' } }
      );

      await expect(client.getStudents()).rejects.toThrow(/log in again/i);
    });
  });

  describe('regression: renamed private helpers', () => {
    it('getStudents should call the API (guards this._get wiring)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: [] });

      await expect(client.getStudents()).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/students`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-ok' }),
        })
      );
    });

    it('registerPushToken should POST and persist the token (guards this._post wiring)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({ status: 200, body: { success: true } });

      await client.registerPushToken('ExponentPushToken[abc]');

      expect(secureStoreData.get('slc_push_token')).toBe('ExponentPushToken[abc]');
    });
  });

  describe('isLoggedIn', () => {
    it('should be true when only a refresh token is present (session can be restored)', async () => {
      secureStoreData.set('slc_refresh_token', 'refresh-token-1');

      await expect(client.isLoggedIn()).resolves.toBe(true);
    });

    it('should be false with no tokens at all', async () => {
      await expect(client.isLoggedIn()).resolves.toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear all auth tokens', async () => {
      secureStoreData.set('slc_access_token', 'a');
      secureStoreData.set('slc_refresh_token', 'b');
      secureStoreData.set('slc_connector_token', 'c');

      await client.logout();

      expect(secureStoreData.has('slc_access_token')).toBe(false);
      expect(secureStoreData.has('slc_refresh_token')).toBe(false);
      expect(secureStoreData.has('slc_connector_token')).toBe(false);
    });
  });
});
