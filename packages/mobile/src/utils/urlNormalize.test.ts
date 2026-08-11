/**
 * urlNormalize tests — table-driven, pure string parsing (no URL API).
 */

import { normalizeUrl, extractHostname, isSameNormalizedUrl } from './urlNormalize';

describe('normalizeUrl', () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    { name: 'trims whitespace', input: '  https://x.com  ', expected: 'https://x.com' },
    { name: 'strips one trailing slash', input: 'https://x.com/', expected: 'https://x.com' },
    { name: 'strips many trailing slashes', input: 'https://x.com///', expected: 'https://x.com' },
    {
      name: 'lowercases scheme and host but keeps path case',
      input: 'HTTPS://Host.Example.COM/Some/Path',
      expected: 'https://host.example.com/Some/Path',
    },
    {
      name: 'strips trailing slash after a path',
      input: 'https://x.com/portal/',
      expected: 'https://x.com/portal',
    },
    {
      name: 'keeps credential case, lowercases host',
      input: 'https://User:Pass@Host.Com/Home',
      expected: 'https://User:Pass@host.com/Home',
    },
    {
      name: 'lowercases host with port',
      input: 'https://Host.Com:8080/A',
      expected: 'https://host.com:8080/A',
    },
    {
      name: 'custom scheme is lowercased too',
      input: 'CANVAS-Courses://Foo.Bar/Baz',
      expected: 'canvas-courses://foo.bar/Baz',
    },
    {
      name: 'no scheme: only trim + slash strip (no host to lowercase)',
      input: '  X.com/ ',
      expected: 'X.com',
    },
    { name: 'empty string stays empty', input: '', expected: '' },
    { name: 'about:blank untouched', input: 'about:blank', expected: 'about:blank' },
    {
      name: 'query case preserved',
      input: 'https://X.com/p?Case=Sensitive',
      expected: 'https://x.com/p?Case=Sensitive',
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe('extractHostname', () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: 'lowercases mixed-case host',
      input: 'https://Host.Example.com/path',
      expected: 'host.example.com',
    },
    { name: 'no :// means unparseable', input: 'httpfoo.com', expected: '' },
    { name: 'empty string', input: '', expected: '' },
    { name: 'whitespace only', input: '   ', expected: '' },
    { name: 'scheme only', input: 'https://', expected: '' },
    { name: 'missing scheme before ://', input: '://host.com', expected: '' },
    { name: 'plain host, no path', input: 'https://x.com', expected: 'x.com' },
    {
      name: 'strips creds@',
      input: 'https://user:secret@Portal.School.org/x',
      expected: 'portal.school.org',
    },
    { name: 'strips port', input: 'https://x.com:8443/login', expected: 'x.com' },
    { name: 'strips creds and port together', input: 'https://u:p@X.com:8443', expected: 'x.com' },
    { name: 'stops at ?', input: 'https://x.com?next=/home', expected: 'x.com' },
    { name: 'stops at #', input: 'https://x.com#frag', expected: 'x.com' },
    {
      name: 'custom scheme still parses',
      input: 'skyward://Family.Access.net/app',
      expected: 'family.access.net',
    },
    { name: 'trims surrounding whitespace', input: '  https://x.com/a  ', expected: 'x.com' },
    { name: 'garbage', input: 'not a url at all', expected: '' },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(extractHostname(input)).toBe(expected);
  });
});

describe('isSameNormalizedUrl', () => {
  const cases: Array<{ name: string; a: string; b: string; expected: boolean }> = [
    {
      name: 'trailing slash is equivalent',
      a: 'https://x.com',
      b: 'https://x.com/',
      expected: true,
    },
    { name: 'host casing is equivalent', a: 'https://X.COM', b: 'https://x.com', expected: true },
    { name: 'scheme casing is equivalent', a: 'HTTPS://x.com', b: 'https://x.com', expected: true },
    { name: 'whitespace is equivalent', a: ' https://x.com ', b: 'https://x.com', expected: true },
    {
      name: 'path slash + casing combined',
      a: 'https://X.com/portal/',
      b: 'https://x.com/portal',
      expected: true,
    },
    { name: 'different paths differ', a: 'https://x.com/a', b: 'https://x.com/b', expected: false },
    { name: 'path case matters', a: 'https://x.com/A', b: 'https://x.com/a', expected: false },
    { name: 'different hosts differ', a: 'https://a.com', b: 'https://b.com', expected: false },
    { name: 'both empty are equal', a: '', b: '', expected: true },
  ];

  it.each(cases)('$name', ({ a, b, expected }) => {
    expect(isSameNormalizedUrl(a, b)).toBe(expected);
  });
});
