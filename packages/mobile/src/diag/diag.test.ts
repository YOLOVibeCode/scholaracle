/**
 * Unit tests for the diag core: store, redact, and capture.
 * AppState is included in the react-native mock via jest.setup.ts.
 */
import { log, getEntries, resetDiagStoreForTests } from './store';
import { redact, fingerprint } from './redact';
import { installDiagCapture, uninstallDiagCaptureForTests } from './capture';

// ── redact ────────────────────────────────────────────────────────────────────

describe('redact', () => {
  it('fingerprints sensitive object keys and never emits the raw value', () => {
    const out = redact({
      token: 'abcdefghijklmnopqrstuvwxyz',
      password: 'mock-password-value-xyz',
    }) as Record<string, string>;
    expect(out.token).toMatch(/^tok:abcdef/);
    expect(out.token).not.toContain('ghijklmn');
    expect(out.password).toMatch(/^tok:/);
    expect(out.password).not.toContain('password-value');
  });

  it('redacts Bearer tokens in strings', () => {
    const s = redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz') as string;
    expect(s).toContain('Bearer tok:');
    expect(s).not.toContain('abcdefghijklmnop');
  });

  it('redacts X-Amz-Signature in signed asset URLs', () => {
    const url =
      'https://s3.amazonaws.com/bucket/file.pdf' +
      '?X-Amz-Signature=ABCDEFGHIJKLMNO&X-Amz-Credential=KEYID&Expires=9999999999';
    const out = redact(url) as string;
    expect(out).toContain('X-Amz-Signature=tok:');
    expect(out).not.toContain('ABCDEFGHIJKLMNO');
    expect(out).toContain('Expires=tok:');
    expect(out).not.toContain('9999999999');
  });

  it('does not redact ordinary API paths', () => {
    const s = redact('https://api.scholarmancy.com/api/students') as string;
    expect(s).toBe('https://api.scholarmancy.com/api/students');
  });

  it('fingerprints short values without leaking content', () => {
    expect(fingerprint('abcd')).toBe('tok:****(len 4)');
  });

  it('passes non-string, non-object values through unchanged', () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBe(null);
  });
});

// ── store ─────────────────────────────────────────────────────────────────────

describe('store', () => {
  beforeEach(() => resetDiagStoreForTests());

  it('records entries with dt and increasing seq', () => {
    const a = log('info', 'act', 'hello');
    const b = log('warn', 'nav', 'world');
    expect(b.seq).toBe(a.seq + 1);
    expect(b.dt).toBeGreaterThanOrEqual(0);
  });

  it('evicts oldest entries past the 1000-entry cap', () => {
    for (let i = 0; i < 1005; i += 1) log('info', 'act', `n${i}`);
    const rows = getEntries();
    expect(rows).toHaveLength(1000);
    expect(rows[0]?.msg).toBe('n5');
    expect(rows[rows.length - 1]?.msg).toBe('n1004');
  });

  it('filters by tag', () => {
    log('info', 'nav', 'page-a');
    log('info', 'net', 'GET 200');
    const navOnly = getEntries(['nav']);
    expect(navOnly).toHaveLength(1);
    expect(navOnly[0]?.msg).toBe('page-a');
  });

  it('redacts sensitive data at write time', () => {
    log('info', 'auth', 'signed in', { token: 'abcdefghijklmnopqrstuvwxyz' });
    const data = getEntries()[0]?.data;
    expect(JSON.stringify(data)).not.toContain('ghijklmn');
    expect(JSON.stringify(data)).toContain('tok:');
  });

  it('returns all entries when no tag filter supplied', () => {
    log('debug', 'net', 'a');
    log('info', 'nav', 'b');
    expect(getEntries()).toHaveLength(2);
  });
});

// ── capture ───────────────────────────────────────────────────────────────────

describe('capture fetch tap', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    resetDiagStoreForTests();
    uninstallDiagCaptureForTests();
  });

  afterEach(() => {
    uninstallDiagCaptureForTests();
    global.fetch = origFetch;
  });

  it('logs network status and returns the original response', async () => {
    const body = JSON.stringify({ data: [] });
    const fake = {
      ok: true,
      status: 200,
      clone: () => ({ text: async () => body }),
      json: async () => ({ data: [] }) as unknown,
      text: async () => body,
      headers: { get: () => 'application/json' },
    };
    global.fetch = jest.fn(async () => fake) as unknown as typeof fetch;
    installDiagCapture();

    const res = (await fetch(
      'https://api.scholarmancy.com/api/students'
    )) as unknown as typeof fake;
    expect(res.status).toBe(200);

    const net = getEntries(['net']);
    expect(net.some((e) => e.msg.includes('200') && e.msg.includes('/api/students'))).toBe(true);
  });

  it('does not swallow fetch errors', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network offline');
    }) as typeof fetch;
    installDiagCapture();

    await expect(fetch('https://api.scholarmancy.com/api/health')).rejects.toThrow(
      'network offline'
    );
    const net = getEntries(['net']);
    expect(net[0]?.level).toBe('error');
  });

  it('is idempotent — installing twice does not double-wrap', async () => {
    const fake = {
      ok: true,
      status: 204,
      clone: () => ({ text: async () => '' }),
      json: async () => ({}) as unknown,
      text: async () => '',
      headers: { get: () => null },
    };
    global.fetch = jest.fn(async () => fake) as unknown as typeof fetch;
    installDiagCapture();
    installDiagCapture(); // second call must be a no-op

    await fetch('https://api.scholarmancy.com/api/health');
    const net = getEntries(['net']);
    expect(net.filter((e) => e.msg.includes('/api/health'))).toHaveLength(1);
  });
});
