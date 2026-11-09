import { extractMagicToken } from './magicDeepLink';

describe('extractMagicToken', () => {
  it('extracts token from query-string form', () => {
    expect(extractMagicToken('scholarmancy://magic?token=abc123')).toBe('abc123');
  });

  it('extracts token with double-slash', () => {
    expect(extractMagicToken('scholarmancy:///magic?token=xyz')).toBe('xyz');
  });

  it('decodes URL-encoded token', () => {
    const encoded = 'scholarmancy://magic?token=a%2Bb%3Dc';
    expect(extractMagicToken(encoded)).toBe('a+b=c');
  });

  it('extracts token from path form', () => {
    expect(extractMagicToken('scholarmancy://magic/mytoken')).toBe('mytoken');
  });

  it('returns null for demo link', () => {
    expect(extractMagicToken('scholarmancy://demo')).toBeNull();
  });

  it('returns null for diag link', () => {
    expect(extractMagicToken('scholarmancy://diag')).toBeNull();
  });

  it('returns null for bare magic with no token', () => {
    expect(extractMagicToken('scholarmancy://magic')).toBeNull();
    expect(extractMagicToken('scholarmancy://magic?')).toBeNull();
    expect(extractMagicToken('scholarmancy://magic?other=foo')).toBeNull();
  });

  it('returns null for null / undefined / empty', () => {
    expect(extractMagicToken(null)).toBeNull();
    expect(extractMagicToken(undefined)).toBeNull();
    expect(extractMagicToken('')).toBeNull();
  });

  it('is case-insensitive for the scheme', () => {
    expect(extractMagicToken('SCHOLARMANCY://magic?token=tok')).toBe('tok');
  });

  it('extracts the token from a scholarmancy.com universal / app link', () => {
    expect(extractMagicToken('https://scholarmancy.com/magic?token=abc123')).toBe('abc123');
    expect(extractMagicToken('https://www.scholarmancy.com/magic?token=a%2Bb')).toBe('a+b');
    expect(extractMagicToken('HTTPS://SCHOLARMANCY.COM/magic/pathTok')).toBe('pathTok');
  });

  it('ignores other web hosts, insecure http, and other paths', () => {
    expect(extractMagicToken('https://evil.example/magic?token=abc')).toBeNull();
    expect(extractMagicToken('https://scholarmancy.com.evil.example/magic?token=abc')).toBeNull();
    expect(extractMagicToken('http://scholarmancy.com/magic?token=abc')).toBeNull();
    expect(extractMagicToken('https://scholarmancy.com/login?token=abc')).toBeNull();
    expect(extractMagicToken('https://scholarmancy.com/pricing')).toBeNull();
  });

  it('returns null instead of throwing on a malformed percent escape', () => {
    expect(extractMagicToken('https://scholarmancy.com/magic?token=%E0%A4%A')).toBeNull();
  });
});
