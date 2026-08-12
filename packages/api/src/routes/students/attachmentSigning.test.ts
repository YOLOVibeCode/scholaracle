import { extractOwnAssetId, resolveApiBaseUrl, signOwnAssetAttachments } from './attachmentSigning';

const BASE = 'https://api.test.example';
const SECRET = 'mock-signing-secret';

describe('resolveApiBaseUrl', () => {
  const savedApiBaseUrl = process.env['API_BASE_URL'];
  const savedRailwayDomain = process.env['RAILWAY_PUBLIC_DOMAIN'];

  afterEach(() => {
    if (savedApiBaseUrl === undefined) delete process.env['API_BASE_URL'];
    else process.env['API_BASE_URL'] = savedApiBaseUrl;
    if (savedRailwayDomain === undefined) delete process.env['RAILWAY_PUBLIC_DOMAIN'];
    else process.env['RAILWAY_PUBLIC_DOMAIN'] = savedRailwayDomain;
  });

  it('should prefer an explicit API_BASE_URL over everything', () => {
    process.env['API_BASE_URL'] = 'https://override.example';
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'api.railway.example';

    expect(resolveApiBaseUrl('https://web.example')).toBe('https://override.example');
  });

  it('should build https origin from RAILWAY_PUBLIC_DOMAIN, ignoring the web baseUrl', () => {
    delete process.env['API_BASE_URL'];
    process.env['RAILWAY_PUBLIC_DOMAIN'] = 'api.railway.example';

    expect(resolveApiBaseUrl('https://web.example')).toBe('https://api.railway.example');
  });

  it('should fall back to the config baseUrl outside Railway (local dev, tests)', () => {
    delete process.env['API_BASE_URL'];
    delete process.env['RAILWAY_PUBLIC_DOMAIN'];

    expect(resolveApiBaseUrl('http://localhost:2801')).toBe('http://localhost:2801');
    expect(resolveApiBaseUrl(undefined)).toBe('');
  });
});

describe('extractOwnAssetId', () => {
  it.each([
    ['https://api.test.example/api/assets/abc-123', 'abc-123'],
    ['https://api.test.example/api/assets/abc-123?foo=1', 'abc-123'],
    ['/api/assets/rel-456', 'rel-456'],
    ['https://api.test.example/api/assets/', null],
    ['https://other-host.example/api/assets/abc-123', null],
    ['https://school.instructure.com/files/999/download', null],
    ['', null],
    [undefined, null],
  ])('%s -> %s', (url, expected) => {
    expect(extractOwnAssetId(url as string | undefined, BASE)).toBe(expected);
  });

  it('should tolerate a trailing slash on baseUrl', () => {
    expect(extractOwnAssetId('https://api.test.example/api/assets/x-1', `${BASE}/`)).toBe('x-1');
  });
});

describe('signOwnAssetAttachments', () => {
  it('should sign own-asset URLs and leave portal URLs untouched', () => {
    const result = signOwnAssetAttachments(
      [
        { name: 'own.png', url: `${BASE}/api/assets/asset-1`, type: 'image/png' },
        { name: 'portal.pdf', url: 'https://school.example.com/doc/1', type: 'application/pdf' },
      ],
      BASE,
      SECRET
    );

    expect(result?.[0]?.downloadUrl).toContain('/api/assets/asset-1?sig=');
    expect(result?.[0]?.downloadUrl).toContain('&exp=');
    expect(result?.[0]?.url).toBe(`${BASE}/api/assets/asset-1`);
    expect(result?.[1]?.downloadUrl).toBeUndefined();
  });

  it('should be a passthrough when jwtSecret is missing', () => {
    const attachments = [{ name: 'own.png', url: `${BASE}/api/assets/asset-1` }];

    const result = signOwnAssetAttachments(attachments, BASE, undefined);

    expect(result?.[0]?.downloadUrl).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(signOwnAssetAttachments(undefined, BASE, SECRET)).toBeUndefined();
  });
});
