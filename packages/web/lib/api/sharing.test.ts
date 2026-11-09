import { sharingApi } from './sharing';

function fakeResponse(body: unknown, status = 200): Response {
  const isOk = status >= 200 && status < 300;
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const BASE = 'http://localhost:2801/api';

describe('sharingApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse({ success: true }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('invite POSTs one body for several students to /sharing/invites', async () => {
    const result = {
      inviteGroupId: 'grp-1',
      perStudent: [{ studentId: 's1', status: 'invited' }],
      smsOptInUrl: 'http://localhost:2800/sms/optin/tok',
    };
    fetchSpy.mockResolvedValue(fakeResponse(result, 201));

    const body = {
      email: 'jessica@example.com',
      label: 'parent' as const,
      isAdmin: true,
      studentIds: ['s1', 's2'],
      alertChannels: ['email' as const, 'push' as const],
    };
    const res = await sharingApi.invite(body);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/sharing/invites`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    );
    expect(res).toEqual(result);
  });

  it('getPendingInvites never passes an email: the server uses the JWT', async () => {
    fetchSpy.mockResolvedValue(fakeResponse([]));
    await sharingApi.getPendingInvites();
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/sharing/invites/pending`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('accept and decline send the selection as given', async () => {
    await sharingApi.accept({ inviteGroupId: 'grp-1' });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/sharing/invites/accept`,
      expect.objectContaining({ body: JSON.stringify({ inviteGroupId: 'grp-1' }) })
    );
    await sharingApi.decline({ studentIds: ['s1'] });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/sharing/invites/decline`,
      expect.objectContaining({ body: JSON.stringify({ studentIds: ['s1'] }) })
    );
  });

  it('resend encodes the group id in the path', async () => {
    await sharingApi.resend('grp/1');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/sharing/invites/grp%2F1/resend`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('leave POSTs the student id and returns success', async () => {
    expect(await sharingApi.leave('s1')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/sharing/leave`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ studentId: 's1' }) })
    );
  });

  it('per-student people calls use /students/:id/contacts and encode the email', async () => {
    await sharingApi.listPeople('s1');
    expect(fetchSpy).toHaveBeenLastCalledWith(`${BASE}/students/s1/contacts`, expect.anything());

    await sharingApi.updatePerson('s1', 'a+b@example.com', { receiveAlerts: false, alertChannels: [] });
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/students/s1/contacts/a%2Bb%40example.com`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ receiveAlerts: false, alertChannels: [] }),
      })
    );

    await sharingApi.setAdmin('s1', 'a@example.com', true);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/students/s1/contacts/a%40example.com/admin`,
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ isAdmin: true }) })
    );

    await sharingApi.removePerson('s1', 'a@example.com');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/students/s1/contacts/a%40example.com`,
      expect.objectContaining({ method: 'DELETE' })
    );

    await sharingApi.sendLoginLink('s1', 'a@example.com');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${BASE}/students/s1/contacts/a%40example.com/magic-link/send`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ channel: 'email' }) })
    );
  });

  it('mine GETs /sharing/mine', async () => {
    fetchSpy.mockResolvedValue(fakeResponse({ students: [] }));
    expect(await sharingApi.mine()).toEqual({ students: [] });
    expect(fetchSpy).toHaveBeenCalledWith(`${BASE}/sharing/mine`, expect.anything());
  });
});
