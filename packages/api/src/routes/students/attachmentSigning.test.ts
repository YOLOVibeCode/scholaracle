import { extractOwnAssetId, signOwnAssetAttachments } from './attachmentSigning';

const BASE = 'https://api.test.example';
const SECRET = 'mock-signing-secret';

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
