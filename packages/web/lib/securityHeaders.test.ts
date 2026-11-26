/**
 * Every page the web app serves must carry the browser protections below.
 * On 25 Nov 2026 scholarmancy.com sent none of them (the API sent all of them).
 */
import nextConfig from '../next.config';

async function headersForEveryPage(): Promise<Map<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === '/:path*');
  return new Map((rule?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
}

function cspDirectives(policy: string | undefined): Map<string, string> {
  const pairs = (policy ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part): [string, string] => {
      const [name = '', ...values] = part.split(/\s+/);
      return [name, values.join(' ')];
    });
  return new Map(pairs);
}

describe('security headers on every page', () => {
  it('has one rule that covers every path', async () => {
    const headers = await headersForEveryPage();
    expect(headers.size).toBeGreaterThan(0);
  });

  it('tells the browser to use HTTPS for this host for a year', async () => {
    const headers = await headersForEveryPage();
    expect(headers.get('strict-transport-security')).toBe('max-age=31536000');
  });

  it('does not extend HTTPS-only to subdomains or to the browser preload list', async () => {
    // Both are hard to undo, and a subdomain that only answers on http (a mail
    // link-tracking host, for example) would stop working for returning visitors.
    const value = (await headersForEveryPage()).get('strict-transport-security') ?? '';
    expect(value).not.toMatch(/includeSubDomains/i);
    expect(value).not.toMatch(/preload/i);
  });

  it('lets only this site put its pages in a frame', async () => {
    const headers = await headersForEveryPage();
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    const csp = cspDirectives(headers.get('content-security-policy'));
    expect(csp.get('frame-ancestors')).toBe("'self'");
  });

  it('stops an injected <base> tag from redirecting relative links', async () => {
    const csp = cspDirectives((await headersForEveryPage()).get('content-security-policy'));
    expect(csp.get('base-uri')).toBe("'self'");
  });

  it('does not yet restrict scripts, styles, frames or plugins', async () => {
    // Those need a nonce on every script Next.js writes and a pass through every
    // page in a browser. Until that is done, a directive here would break pages
    // (the PDF viewer, the feedback widget) without anyone noticing in a test.
    const csp = cspDirectives((await headersForEveryPage()).get('content-security-policy'));
    expect([...csp.keys()].sort()).toEqual(['base-uri', 'frame-ancestors']);
  });

  it('stops the browser from guessing a file type', async () => {
    expect((await headersForEveryPage()).get('x-content-type-options')).toBe('nosniff');
  });

  it('sends other sites the origin only, never the path or a login token', async () => {
    expect((await headersForEveryPage()).get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
  });

  it('turns off the camera, microphone and location, which the site does not use', async () => {
    expect((await headersForEveryPage()).get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=()'
    );
  });

  it('does not announce the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('keeps the rules for the app-link files', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const sources = rules.map((r) => r.source);
    expect(sources).toContain('/.well-known/apple-app-site-association');
    expect(sources).toContain('/.well-known/assetlinks.json');
  });
});
