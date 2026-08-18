/**
 * SOURCE_INVITE.md §6 / §9
 */

import { sourceInvitesApi } from './sourceInvites';

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

describe('sourceInvitesApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('issue posts only the allowlisted body', async () => {
    const body = {
      success: true as const,
      expiresAt: '2026-08-22T00:00:00.000Z',
      emailedTo: 'parent@example.com',
    };
    fetchSpy.mockResolvedValue(fakeResponse(body));
    const request = {
      studentId: 'stu-1',
      provider: 'skyward' as const,
      portalBaseUrl: 'https://skyward.iscorp.com',
    };
    const result = await sourceInvitesApi.issue(request);
    expect(result).toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/source-invites`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      })
    );
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body)) as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty('to');
    expect(sent).not.toHaveProperty('password');
  });

  it('redeem posts token only', async () => {
    const invite = {
      provider: 'skyward',
      adapterId: 'com.skyward.iscorp',
      portalBaseUrl: 'https://skyward.iscorp.com',
      displayName: 'Skyward',
      studentId: 'stu-1',
      studentExternalId: 'ava-lewis',
      institutionExternalId: 'skyward.iscorp.com',
    };
    fetchSpy.mockResolvedValue(fakeResponse({ success: true, invite }));
    const token = 'ab'.repeat(32);
    const result = await sourceInvitesApi.redeem(token);
    expect(result).toEqual(invite);
    const sent = JSON.parse(String((fetchSpy.mock.calls[0] as [string, { body: string }])[1].body)) as Record<
      string,
      unknown
    >;
    expect(sent).toEqual({ token });
    expect(sent).not.toHaveProperty('password');
  });
});
