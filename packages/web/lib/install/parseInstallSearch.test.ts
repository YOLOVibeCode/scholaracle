/**
 * SOURCE_INVITE.md §9
 */

import { parseInstallSearch } from './parseInstallSearch';

const HEX = 'ab'.repeat(32);

describe('parseInstallSearch', () => {
  it('reads t from search', () => {
    expect(parseInstallSearch(`?t=${HEX}`)).toBe(HEX);
    expect(parseInstallSearch(`t=${HEX}`)).toBe(HEX);
  });

  it('returns null for missing or invalid t', () => {
    expect(parseInstallSearch('')).toBeNull();
    expect(parseInstallSearch('?foo=1')).toBeNull();
    expect(parseInstallSearch('?t=short')).toBeNull();
  });
});
