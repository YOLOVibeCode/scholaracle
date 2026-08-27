import { extractHostname, isSameNormalizedUrl, isSchoolLoginHost, normalizeUrl } from './urlHost';

describe('extractHostname', () => {
  it('lowercases mixed-case host and strips port', () => {
    expect(extractHostname('https://Host.Example.com:8443/path')).toBe('host.example.com');
  });

  it('returns empty when unparseable', () => {
    expect(extractHostname('httpfoo.com')).toBe('');
    expect(extractHostname('')).toBe('');
  });
});

describe('isSameNormalizedUrl', () => {
  it('treats trailing slash and host casing as equivalent', () => {
    expect(isSameNormalizedUrl('HTTPS://X.com/portal/', 'https://x.com/portal')).toBe(true);
  });

  it('treats different paths as different', () => {
    expect(isSameNormalizedUrl('https://x.com/a', 'https://x.com/b')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('lowercases scheme and host', () => {
    expect(normalizeUrl('HTTPS://Host.Example.COM/Some/Path')).toBe(
      'https://host.example.com/Some/Path'
    );
  });
});

describe('isSchoolLoginHost', () => {
  it('flags Canvas / Skyward / Classroom hosts', () => {
    expect(isSchoolLoginHost('https://school.instructure.com/files/1')).toBe(true);
    expect(isSchoolLoginHost('https://classroom.google.com/c/abc')).toBe(true);
    expect(isSchoolLoginHost('https://www.khanacademy.org/bio')).toBe(false);
  });
});
