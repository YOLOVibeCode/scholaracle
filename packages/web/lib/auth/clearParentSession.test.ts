import {
  SESSION_REDIRECT_REASON_KEY,
  clearParentSessionAndRedirect,
  rememberSessionRedirectReason,
  takeSessionRedirectReason,
} from './clearParentSession';

type ReasonStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser globals this module touches; the node test environment has none of them. */
type BrowserGlobals = {
  window?: unknown;
  localStorage?: unknown;
  sessionStorage?: unknown;
  document?: { cookie: string };
};

const browser = globalThis as unknown as BrowserGlobals;

function memoryStorage(store: Record<string, string> = {}): ReasonStorage {
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

function throwingStorage(): ReasonStorage {
  const blocked = (): never => {
    throw new Error('storage blocked');
  };
  return { getItem: blocked, setItem: blocked, removeItem: blocked };
}

describe('session redirect reason handover', () => {
  it('is read once: remembered, taken, then gone', () => {
    const storage = memoryStorage();
    expect(takeSessionRedirectReason(storage)).toBeNull();

    rememberSessionRedirectReason('session_expired', storage);
    expect(storage.getItem(SESSION_REDIRECT_REASON_KEY)).toBe('session_expired');

    expect(takeSessionRedirectReason(storage)).toBe('session_expired');
    expect(takeSessionRedirectReason(storage)).toBeNull();
  });

  it('discards a value it did not write', () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_REDIRECT_REASON_KEY, 'tampered');
    expect(takeSessionRedirectReason(storage)).toBeNull();
    expect(storage.getItem(SESSION_REDIRECT_REASON_KEY)).toBeNull();
  });

  it('never throws when storage is blocked or absent', () => {
    expect(() => rememberSessionRedirectReason('session_expired', throwingStorage())).not.toThrow();
    expect(takeSessionRedirectReason(throwingStorage())).toBeNull();
    expect(takeSessionRedirectReason(null)).toBeNull();
  });
});

describe('clearParentSessionAndRedirect', () => {
  let local: Record<string, string>;
  let session: Record<string, string>;
  let navigatedTo: string;

  beforeEach(() => {
    local = { auth_token: 'jwt', refresh_token: 'refresh-local' };
    session = { refresh_token: 'refresh-session' };
    navigatedTo = '';
    browser.window = {
      location: {
        get href() {
          return navigatedTo;
        },
        set href(value: string) {
          navigatedTo = value;
        },
      },
    };
    browser.localStorage = memoryStorage(local);
    browser.sessionStorage = memoryStorage(session);
    browser.document = { cookie: 'auth_token=jwt' };
  });

  afterEach(() => {
    browser.window = undefined;
    browser.localStorage = undefined;
    browser.sessionStorage = undefined;
    browser.document = undefined;
  });

  it('clears every token, expires the cookie, remembers the reason, then navigates to /login', () => {
    clearParentSessionAndRedirect('session_expired');

    expect(local['auth_token']).toBeUndefined();
    expect(local['refresh_token']).toBeUndefined();
    expect(session['refresh_token']).toBeUndefined();
    expect(browser.document?.cookie).toMatch(/^auth_token=;/);
    expect(session[SESSION_REDIRECT_REASON_KEY]).toBe('session_expired');
    expect(navigatedTo).toBe('/login?reason=session_expired');
  });

  it('remembers the reason before navigating, so a navigation the browser drops still leaves it behind', () => {
    // Chromium ignores this renderer-initiated navigation while a reload is already in flight.
    const order: string[] = [];
    browser.window = {
      location: {
        get href() {
          return '';
        },
        set href(value: string) {
          order.push(`navigate:${value}`);
        },
      },
    };
    const recording = memoryStorage(session);
    browser.sessionStorage = {
      ...recording,
      setItem: (key: string, value: string) => {
        recording.setItem(key, value);
        order.push(`store:${key}`);
      },
    };

    clearParentSessionAndRedirect();

    expect(order).toEqual([
      `store:${SESSION_REDIRECT_REASON_KEY}`,
      'navigate:/login?reason=session_expired',
    ]);
  });

  it('does nothing on the server', () => {
    browser.window = undefined;

    expect(() => clearParentSessionAndRedirect()).not.toThrow();
    expect(local['auth_token']).toBe('jwt');
    expect(session[SESSION_REDIRECT_REASON_KEY]).toBeUndefined();
  });
});
