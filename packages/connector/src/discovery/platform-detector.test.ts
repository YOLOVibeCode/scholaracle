/**
 * Tests for platform detection: URL pattern matching and optional HTTP probe.
 */
import { detectPlatformFromUrl, detectPlatform } from './platform-detector';

describe('detectPlatformFromUrl', () => {
  it('should detect Canvas from instructure.com URL', () => {
    const r = detectPlatformFromUrl('https://school.instructure.com/login');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('canvas');
    expect(r.adapterId).toBe('com.instructure.canvas');
    expect(r.confidence).toBe('high');
    expect(r.signals.some((s) => s.includes('instructure'))).toBe(true);
  });

  it('should detect Canvas from /login/canvas path', () => {
    const r = detectPlatformFromUrl('https://example.edu/login/canvas');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('canvas');
    expect(r.confidence).toBe('high');
  });

  it('should detect Skyward from skyward.com URL', () => {
    const r = detectPlatformFromUrl('https://myschool.skyward.com/portal');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('skyward-qmlativ');
    expect(r.adapterId).toBe('com.skyward.qmlativ');
    expect(r.confidence).toBe('high');
  });

  it('should detect Google Classroom from classroom.google.com', () => {
    const r = detectPlatformFromUrl('https://classroom.google.com');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('google-classroom');
    expect(r.confidence).toBe('high');
  });

  it('should return detected false and low confidence for unrecognized URL', () => {
    const r = detectPlatformFromUrl('https://unknown-portal.example.edu');
    expect(r.detected).toBe(false);
    expect(r.provider).toBeNull();
    expect(r.adapterId).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.signals.some((s) => s.includes('No URL patterns'))).toBe(true);
  });

  it('should include suggestedAuthMethod and apiBaseUrl when descriptor has template', () => {
    const r = detectPlatformFromUrl('https://school.instructure.com');
    expect(r.suggestedAuthMethod).toBe('bearer-token');
    expect(r.apiBaseUrl).toBe('https://school.instructure.com/api/v1');
  });

  it('should match URL patterns case-insensitively', () => {
    const r = detectPlatformFromUrl('https://SCHOOL.INSTRUCTURE.COM');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('canvas');
  });
});

describe('detectPlatform', () => {
  it('should return URL result without probing when URL matches', async () => {
    const r = await detectPlatform('https://school.instructure.com');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('canvas');
    expect(r.confidence).toBe('high');
  });

  it('should return URL-only result when probe is false', async () => {
    const r = await detectPlatform('https://mystery-school.edu', { probe: false });
    expect(r.detected).toBe(false);
    expect(r.confidence).toBe('low');
    expect(r.signals.some((s) => s.includes('No URL patterns'))).toBe(true);
  });

  it('should use HTTP probe and detect from HTML when URL does not match', async () => {
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html><body>Powered by Instructure Canvas</body></html>'),
      headers: new Headers(),
    });

    const r = await detectPlatform('https://mystery-school.edu/portal');
    expect(r.detected).toBe(true);
    expect(r.provider).toBe('canvas');
    expect(r.confidence).toBe('medium');
    expect(r.signals.some((s) => s.includes('instructure'))).toBe(true);

    (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
  });

  it('should return detected false and include error when fetch fails', async () => {
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network error'));

    const r = await detectPlatform('https://mystery-school.edu');
    expect(r.detected).toBe(false);
    expect(r.provider).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.signals.some((s) => s.includes('Failed to fetch'))).toBe(true);

    (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
  });

  it('should return detected false when response is not ok', async () => {
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
    });

    const r = await detectPlatform('https://mystery-school.edu');
    expect(r.detected).toBe(false);
    expect(r.signals.some((s) => s.includes('HTTP 500'))).toBe(true);

    (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
  });

  it('should respect timeout and abort fetch', async () => {
    const origFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = jest.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 5);
        })
    );

    const r = await detectPlatform('https://mystery-school.edu', { timeoutMs: 1 });
    expect(r.detected).toBe(false);
    expect(r.signals.some((s) => s.includes('Failed to fetch') || s.includes('Abort'))).toBe(true);

    (globalThis as unknown as { fetch: typeof fetch }).fetch = origFetch;
  });
});
