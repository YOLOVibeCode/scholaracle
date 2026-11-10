import { StudioAuthError } from '@/lib/api/studio';
import { loadForStudio, requireStudioToken } from './requireStudioToken';

const getCookie = jest.fn();
const redirect = jest.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => getCookie(name) }),
}));

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}));

describe('requireStudioToken', () => {
  beforeEach(() => {
    getCookie.mockReset();
    redirect.mockClear();
  });

  it('returns the auth_token cookie', async () => {
    getCookie.mockReturnValue({ value: 'emma-jwt' });
    await expect(requireStudioToken('/studio/week')).resolves.toBe('emma-jwt');
    expect(getCookie).toHaveBeenCalledWith('auth_token');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a visitor without a token to login, coming back to the page', async () => {
    getCookie.mockReturnValue(undefined);
    await expect(requireStudioToken('/studio/week')).rejects.toThrow(
      'REDIRECT /login?redirect=/studio/week'
    );
    getCookie.mockReturnValue({ value: '' });
    await expect(requireStudioToken('/studio')).rejects.toThrow('REDIRECT /login?redirect=/studio');
  });

  it('loadForStudio hands the token to the fetch and returns both', async () => {
    getCookie.mockReturnValue({ value: 'emma-jwt' });
    const load = jest.fn().mockResolvedValue({ counts: { owed: 1 } });
    await expect(loadForStudio('/studio/week', load)).resolves.toEqual({
      token: 'emma-jwt',
      view: { counts: { owed: 1 } },
    });
    expect(load).toHaveBeenCalledWith('emma-jwt');
  });

  it('loadForStudio turns an auth failure into /login/expired and rethrows anything else', async () => {
    getCookie.mockReturnValue({ value: 'stale-jwt' });
    await expect(
      loadForStudio('/studio/week', async () => {
        throw new StudioAuthError(401);
      })
    ).rejects.toThrow('REDIRECT /login/expired?redirect=/studio/week');
    await expect(
      loadForStudio('/studio/week', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
