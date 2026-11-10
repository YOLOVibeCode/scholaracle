/**
 * ScholarmancyApiClient alert + notification-settings methods. fetch is mocked:
 * no network.
 */

import * as SecureStore from 'expo-secure-store';
import { ScholarmancyApiClient } from './client';

const BASE_URL = 'https://api.test.local';
const secureStoreData = new Map<string, string>();

function mockFetch(status: number, body: unknown): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ScholarmancyApiClient alerts + notification settings', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => secureStoreData.get(key) ?? null
    );
    secureStoreData.set('slc_access_token', 'jwt-access-token-1');
    client = new ScholarmancyApiClient(BASE_URL);
  });

  it('getAlerts GETs /api/alerts-api with the bearer token', async () => {
    const alerts = [{ id: 'a1', type: 'grade_drop', severity: 'critical', acknowledged: false }];
    const fetchMock = mockFetch(200, alerts);
    await expect(client.getAlerts()).resolves.toEqual(alerts);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/alerts-api`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt-access-token-1'
    );
  });

  it('acknowledgeAlert POSTs to the encoded acknowledge route', async () => {
    const fetchMock = mockFetch(200, { success: true });
    await expect(client.acknowledgeAlert('a/1')).resolves.toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/alerts-api/a%2F1/acknowledge`);
    expect(init.method).toBe('POST');
  });

  it('acknowledgeAlert surfaces a 404 as an error', async () => {
    mockFetch(404, { error: 'Alert not found' });
    await expect(client.acknowledgeAlert('gone')).rejects.toThrow();
  });

  it('getNotificationSettings GETs /api/settings', async () => {
    const settings = { timezone: 'America/Chicago', notifications: { push: true }, alerts: {} };
    const fetchMock = mockFetch(200, settings);
    await expect(client.getNotificationSettings()).resolves.toEqual(settings);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${BASE_URL}/api/settings`);
  });

  it('updateNotificationSettings PUTs the partial body to /api/settings', async () => {
    const fetchMock = mockFetch(200, { notifications: {}, alerts: {} });
    const update = {
      timezone: 'America/Chicago',
      notifications: {
        quietHours: { enabled: true, start: '22:00', end: '07:00', criticalOverride: true },
      },
    };
    await client.updateNotificationSettings(update);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/settings`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual(update);
  });
});
