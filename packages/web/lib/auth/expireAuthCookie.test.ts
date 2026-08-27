import { expireAuthCookieOn } from './expireAuthCookie';

describe('expireAuthCookieOn', () => {
  it('deletes the auth_token cookie so a revoked student can reach /login', () => {
    const store = { delete: jest.fn() };
    expireAuthCookieOn(store);
    expect(store.delete).toHaveBeenCalledWith('auth_token');
  });
});
