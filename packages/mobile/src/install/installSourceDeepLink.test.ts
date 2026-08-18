/**
 * SOURCE_INVITE.md §8.1
 */

import { isInstallSourceDeepLink, parseInstallSourceToken } from './installSourceDeepLink';

const AVA_TOKEN = 'ab'.repeat(32);

describe('installSourceDeepLink', () => {
  it.each([
    [`scholarmancy://install-source?t=${AVA_TOKEN}`, AVA_TOKEN],
    [`scholarmancy:install-source?t=${AVA_TOKEN}`, AVA_TOKEN],
    [`scholarmancy:///install-source?t=${AVA_TOKEN}`, AVA_TOKEN],
    [`  SCHOLARMANCY://install-source?t=${AVA_TOKEN}  `, AVA_TOKEN],
    [`scholarmancy://install-source/?t=${AVA_TOKEN}`, AVA_TOKEN],
  ])('parses token from %s', (url, expected) => {
    expect(isInstallSourceDeepLink(url)).toBe(true);
    expect(parseInstallSourceToken(url)).toBe(expected);
  });

  it.each([
    ['scholarmancy://demo', null],
    ['scholarmancy://diag', null],
    [`https://api.example/install-source?t=${AVA_TOKEN}`, null],
    ['scholarmancy://install-source', null],
    ['scholarmancy://install-source?t=abc', null],
    [`scholarmancy://install-source?t=${AVA_TOKEN}&password=x`, AVA_TOKEN],
    [null, null],
    [undefined, null],
    ['not a url', null],
  ])('%s -> token %s', (url, expected) => {
    if (expected === null) {
      if (typeof url === 'string' && url.startsWith('scholarmancy://install-source')) {
        expect(isInstallSourceDeepLink(url)).toBe(true);
      }
      expect(parseInstallSourceToken(url)).toBeNull();
    } else {
      expect(parseInstallSourceToken(url)).toBe(expected);
    }
  });

  it('does not throw on garbage', () => {
    expect(parseInstallSourceToken('::::')).toBeNull();
  });
});
