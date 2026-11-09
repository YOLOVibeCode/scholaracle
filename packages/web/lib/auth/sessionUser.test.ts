import { getSessionUser } from './sessionUser';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(payload))}.sig`;
}

describe('getSessionUser', () => {
  it('reads user id and lower-cased email from the stored parent JWT', () => {
    const token = fakeJwt({ userId: 'u-jess', email: 'Jessica@Example.com', role: 'parent' });
    expect(getSessionUser({ getItem: () => token })).toEqual({
      userId: 'u-jess',
      email: 'jessica@example.com',
    });
  });

  it('returns null without a token or without the claims', () => {
    expect(getSessionUser({ getItem: () => null })).toBeNull();
    expect(getSessionUser({ getItem: () => fakeJwt({ role: 'parent' }) })).toBeNull();
    expect(getSessionUser(null)).toBeNull();
  });
});
