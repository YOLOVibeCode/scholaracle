export const AUTH_TOKEN_COOKIE = 'auth_token';

/** Drop the session cookie so middleware will not bounce a revoked student off /login. */
export function expireAuthCookieOn(store: { delete(name: string): void }): void {
  store.delete(AUTH_TOKEN_COOKIE);
}
