/**
 * ScholarmancyApiClient sharing + contacts methods (Family & guardians). fetch is mocked: no
 * network. Guards the paths, verbs, bodies and the encoding of emails / ids in URLs.
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

function lastCall(fetchMock: jest.Mock): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

describe('ScholarmancyApiClient sharing', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => secureStoreData.get(key) ?? null
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        secureStoreData.set(key, value);
      }
    );
    secureStoreData.set('slc_access_token', 'jwt-access-token-1');
    client = new ScholarmancyApiClient(BASE_URL);
  });

  it('getPendingSharingInvites GETs /api/sharing/invites/pending with the bearer token', async () => {
    const invites = [{ studentId: 's1', studentName: 'Ava', invitedBy: 'u1' }];
    const fetchMock = mockFetch(200, invites);
    await expect(client.getPendingSharingInvites()).resolves.toEqual(invites);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${BASE_URL}/api/sharing/invites/pending`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt-access-token-1'
    );
  });

  it('sendSharingInvite POSTs the request body to /api/sharing/invites', async () => {
    const result = { inviteGroupId: 'g1', perStudent: [{ studentId: 's1', status: 'invited' }] };
    const fetchMock = mockFetch(201, result);
    const request = {
      email: 'co@example.com',
      label: 'parent' as const,
      isAdmin: true,
      studentIds: ['s1', 's2'],
      alertChannels: ['email', 'push'] as const,
    };
    await expect(client.sendSharingInvite(request)).resolves.toEqual(result);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${BASE_URL}/api/sharing/invites`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(request);
  });

  it('acceptSharingInvites and declineSharingInvites POST the selection as given', async () => {
    let fetchMock = mockFetch(200, { success: true, studentIds: ['s1'] });
    await client.acceptSharingInvites({ inviteGroupId: 'g1' });
    expect(lastCall(fetchMock).url).toBe(`${BASE_URL}/api/sharing/invites/accept`);
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ inviteGroupId: 'g1' });

    fetchMock = mockFetch(200, { success: true, studentIds: ['s2'] });
    await client.declineSharingInvites({ studentIds: ['s2'] });
    expect(lastCall(fetchMock).url).toBe(`${BASE_URL}/api/sharing/invites/decline`);
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ studentIds: ['s2'] });
  });

  it('resendSharingInvite POSTs to the encoded group route', async () => {
    const fetchMock = mockFetch(200, { success: true, studentIds: [], expiresAt: 'x' });
    await client.resendSharingInvite('g/1');
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${BASE_URL}/api/sharing/invites/g%2F1/resend`);
    expect(init.method).toBe('POST');
  });

  it('leaveStudent POSTs { studentId } to /api/sharing/leave', async () => {
    const fetchMock = mockFetch(200, { success: true });
    await expect(client.leaveStudent('s1')).resolves.toEqual({ success: true });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${BASE_URL}/api/sharing/leave`);
    expect(JSON.parse(String(init.body))).toEqual({ studentId: 's1' });
  });

  it('getMySharing GETs /api/sharing/mine', async () => {
    const view = { students: [] };
    const fetchMock = mockFetch(200, view);
    await expect(client.getMySharing()).resolves.toEqual(view);
    expect(lastCall(fetchMock).url).toBe(`${BASE_URL}/api/sharing/mine`);
  });

  it('surfaces a 403 on a sharing call as an error', async () => {
    mockFetch(403, { error: 'Only an admin can share this student' });
    await expect(
      client.sendSharingInvite({ email: 'x@y.z', label: 'parent', studentIds: ['s1'] })
    ).rejects.toThrow('Only an admin can share this student');
  });
});

describe('ScholarmancyApiClient student contacts', () => {
  let client: ScholarmancyApiClient;
  const STUDENT = 'st 1';
  const EMAIL = 'co+parent@example.com';
  const ENC = `${BASE_URL}/api/students/st%201/contacts/co%2Bparent%40example.com`;

  beforeEach(() => {
    secureStoreData.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => secureStoreData.get(key) ?? null
    );
    secureStoreData.set('slc_access_token', 'jwt-access-token-1');
    client = new ScholarmancyApiClient(BASE_URL);
  });

  it('getStudentContacts GETs the encoded contacts route', async () => {
    const fetchMock = mockFetch(200, []);
    await expect(client.getStudentContacts(STUDENT)).resolves.toEqual([]);
    expect(lastCall(fetchMock).url).toBe(`${BASE_URL}/api/students/st%201/contacts`);
  });

  it('updateStudentContact PUTs the prefs patch to the encoded email route', async () => {
    const fetchMock = mockFetch(200, { success: true });
    const patch = { receiveAlerts: false, alertChannels: [] as const };
    await client.updateStudentContact(STUDENT, EMAIL, patch);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(ENC);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ receiveAlerts: false, alertChannels: [] });
  });

  it('setStudentContactAdmin PUTs { isAdmin } to the /admin route', async () => {
    const fetchMock = mockFetch(200, { success: true });
    await client.setStudentContactAdmin(STUDENT, EMAIL, true);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${ENC}/admin`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ isAdmin: true });
  });

  it('removeStudentContact DELETEs the encoded email route', async () => {
    const fetchMock = mockFetch(200, { success: true });
    await expect(client.removeStudentContact(STUDENT, EMAIL)).resolves.toBeUndefined();
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(ENC);
    expect(init.method).toBe('DELETE');
  });

  it('sendStudentContactLoginLink POSTs the channel to the magic-link route', async () => {
    const fetchMock = mockFetch(200, { success: true, expiresAt: '2026-01-01T00:00:00.000Z' });
    await client.sendStudentContactLoginLink(STUDENT, EMAIL, { channel: 'email' });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${ENC}/magic-link/send`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'email' });
  });

  it('updateOwnerAlertPrefs PUTs to /owner-alert-prefs', async () => {
    const fetchMock = mockFetch(200, { success: true, ownerAlertPrefs: {} });
    await client.updateOwnerAlertPrefs(STUDENT, { receiveAlerts: true, alertChannels: ['push'] });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${BASE_URL}/api/students/st%201/owner-alert-prefs`);
    expect(init.method).toBe('PUT');
  });
});

describe('session user forcePasswordReset', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      async (key: string) => secureStoreData.get(key) ?? null
    );
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        secureStoreData.set(key, value);
      }
    );
    client = new ScholarmancyApiClient(BASE_URL);
  });

  it('is remembered when a magic-link login creates the account', async () => {
    mockFetch(200, {
      success: true,
      token: 'jwt-1',
      refreshToken: 'r-1',
      user: { id: 'u1', email: 'new@example.com', name: 'New Parent', role: 'parent' },
      forcePasswordReset: true,
    });
    await client.loginWithMagicToken('tok');
    const user = await client.getSessionUser();
    expect(user?.forcePasswordReset).toBe(true);
    expect(user?.email).toBe('new@example.com');
  });

  it('is absent for an ordinary login', async () => {
    mockFetch(200, {
      success: true,
      token: 'jwt-1',
      user: { id: 'u1', email: 'p@example.com', name: 'P', role: 'parent' },
      forcePasswordReset: false,
    });
    await client.login('p@example.com', 'pw');
    const user = await client.getSessionUser();
    expect(user?.forcePasswordReset).toBeUndefined();
  });
});
