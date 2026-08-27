import {
  studentLoginApi,
  type IStudentLoginInviteResponse,
  type IStudentLoginStatus,
} from './studentLogin';

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

describe('studentLoginApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('GETs login status', async () => {
    const status: IStudentLoginStatus = {
      provisioned: true,
      email: 'emma.demo@scholarmancy.com',
      showGrades: false,
    };
    fetchSpy.mockResolvedValue(fakeResponse(status));

    const result = await studentLoginApi.get('emma-id');
    expect(result).toEqual(status);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/students/emma-id/login`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('POSTs invite/reset and returns the one-time password', async () => {
    const body: IStudentLoginInviteResponse = {
      email: 'liam.provision@example.com',
      temporaryPassword: 'TempPass1!',
    };
    fetchSpy.mockResolvedValue(fakeResponse(body));

    const result = await studentLoginApi.invite('liam-id', 'liam.provision@example.com');
    expect(result).toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/students/liam-id/login`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'liam.provision@example.com' }),
      })
    );
  });

  it('PATCHes showGrades and DELETEs to revoke', async () => {
    fetchSpy.mockResolvedValue(
      fakeResponse({ provisioned: true, email: 'e@x.com', showGrades: true })
    );
    await studentLoginApi.setShowGrades('emma-id', true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/students/emma-id/login`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ showGrades: true }),
      })
    );

    fetchSpy.mockResolvedValue(fakeResponse({ success: true }));
    await studentLoginApi.revoke('emma-id');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/students/emma-id/login`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('POSTs magic-link issue and returns the QR payload', async () => {
    const body = {
      loginUrl: 'http://localhost:2800/login?magic=once-only',
      expiresAt: '2026-08-25T21:30:00.000Z',
      qrDataUrl: 'data:image/png;base64,qq',
    };
    fetchSpy.mockResolvedValue(fakeResponse(body));

    const result = await studentLoginApi.issueMagicLink('emma-id');
    expect(result).toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/students/emma-id/login/magic-link`,
      expect.objectContaining({ method: 'POST' })
    );
  });
});
