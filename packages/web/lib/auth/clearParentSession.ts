const REFRESH_TOKEN_KEY = 'refresh_token';

/** sessionStorage key holding why the last session-ending redirect happened; /login reads it once. */
export const SESSION_REDIRECT_REASON_KEY = 'session_redirect_reason';

export type SessionRedirectReason = 'session_expired';

type ReasonStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultReasonStorage(): ReasonStorage | null {
  return typeof window === 'undefined' ? null : sessionStorage;
}

/**
 * Keep the reason somewhere that outlives a navigation we do not control. The redirect in
 * clearParentSessionAndRedirect is renderer-initiated, and Chromium drops it while a
 * browser-initiated navigation (reload, typed URL, back) is already in flight: the session is
 * cleared, the pending navigation lands, and the auth guard sends the person to /login with no
 * reason in the URL. The login page falls back to this value.
 */
export function rememberSessionRedirectReason(
  reason: SessionRedirectReason,
  storage: ReasonStorage | null = defaultReasonStorage()
): void {
  try {
    storage?.setItem(SESSION_REDIRECT_REASON_KEY, reason);
  } catch {
    // Storage blocked: the URL still carries the reason whenever the redirect itself lands.
  }
}

/** Read and clear the remembered reason, so one login page shows it once. */
export function takeSessionRedirectReason(
  storage: ReasonStorage | null = defaultReasonStorage()
): SessionRedirectReason | null {
  try {
    const value = storage?.getItem(SESSION_REDIRECT_REASON_KEY) ?? null;
    if (value !== null) storage?.removeItem(SESSION_REDIRECT_REASON_KEY);
    return value === 'session_expired' ? value : null;
  } catch {
    return null;
  }
}

/** Clear parent JWT state and navigate to login (browser only). */
export function clearParentSessionAndRedirect(
  reason: SessionRedirectReason = 'session_expired'
): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  rememberSessionRedirectReason(reason);
  window.location.href = `/login?reason=${reason}`;
}

/** Thrown after initiating session-expired navigation so callers stop without a generic 401 error. */
export class SessionExpiredRedirectError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredRedirectError';
  }
}
