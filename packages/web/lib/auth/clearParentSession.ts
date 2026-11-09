const REFRESH_TOKEN_KEY = 'refresh_token';

export type SessionRedirectReason = 'session_expired';

/** Clear parent JWT state and navigate to login (browser only). */
export function clearParentSessionAndRedirect(reason: SessionRedirectReason = 'session_expired'): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  window.location.href = `/login?reason=${reason}`;
}

/** Thrown after initiating session-expired navigation so callers stop without a generic 401 error. */
export class SessionExpiredRedirectError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredRedirectError';
  }
}
