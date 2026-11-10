/**
 * Client methods for plan & usage, student edit/remove and server-side source
 * disconnect. fetch is always mocked — these tests never touch the network.
 */

import * as SecureStore from 'expo-secure-store';
import { ScholarmancyApiClient } from './client';
import { ApiError } from './ApiError';

const BASE_URL = 'https://api.test.local';

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mockFetch(...responses: Response[]): jest.Mock {
  const fn = jest.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function callAt(fetchMock: jest.Mock, index: number): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init };
}

describe('ScholarmancyApiClient plan / student / source methods', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === 'slc_access_token' ? 'jwt-1' : null
    );
    client = new ScholarmancyApiClient(BASE_URL);
  });

  it('getSubscription unwraps the subscription from the envelope', async () => {
    const sub = { plan: 'premium', status: 'active', effectivePlan: 'premium', maxStudents: 2 };
    const fetchMock = mockFetch(makeResponse(200, { success: true, subscription: sub }));

    await expect(client.getSubscription()).resolves.toEqual(sub);

    const { url, init } = callAt(fetchMock, 0);
    expect(url).toBe(`${BASE_URL}/api/billing/subscription`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jwt-1');
  });

  it('getSubscription surfaces API errors', async () => {
    mockFetch(makeResponse(500, { success: false, error: 'down', code: 'INTERNAL' }));
    await expect(client.getSubscription()).rejects.toBeInstanceOf(ApiError);
  });

  it('updateStudent PUTs the edit body to /api/students/:id', async () => {
    const updated = { id: 'm1', userId: 'u1', name: 'Eva', grade: 8 };
    const fetchMock = mockFetch(makeResponse(200, updated));

    await expect(client.updateStudent('m1', { name: 'Eva', grade: 8 })).resolves.toEqual(updated);

    const { url, init } = callAt(fetchMock, 0);
    expect(url).toBe(`${BASE_URL}/api/students/m1`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Eva', grade: 8 });
  });

  it('deleteStudent sends DELETE /api/students/:id', async () => {
    const fetchMock = mockFetch(makeResponse(200, { success: true }));

    await client.deleteStudent('m1');

    const { url, init } = callAt(fetchMock, 0);
    expect(url).toBe(`${BASE_URL}/api/students/m1`);
    expect(init.method).toBe('DELETE');
  });

  it('deleteStudent rejects with ApiError carrying the status (404 is distinguishable)', async () => {
    mockFetch(makeResponse(404, { success: false, error: 'Student not found', code: 'NOT_FOUND' }));
    const err = await client.deleteStudent('m1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it('deleteStudentSource sends DELETE with both ids encoded', async () => {
    const fetchMock = mockFetch(makeResponse(200, { success: true }));

    await client.deleteStudentSource('m1', 'local-canvas-school.example.com-m1');

    const { url, init } = callAt(fetchMock, 0);
    expect(url).toBe(`${BASE_URL}/api/students/m1/sources/local-canvas-school.example.com-m1`);
    expect(init.method).toBe('DELETE');
  });

  it('encodes ids that contain reserved characters', async () => {
    const fetchMock = mockFetch(makeResponse(200, { success: true }));
    await client.deleteStudentSource('m 1', 'a/b');
    expect(callAt(fetchMock, 0).url).toBe(`${BASE_URL}/api/students/m%201/sources/a%2Fb`);
  });
});
