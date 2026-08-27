import {
  claimMagicTokenOnce,
  magicTokenFromSearchParam,
  releaseMagicTokenClaim,
} from './magicLogin';

describe('magicLogin helpers', () => {
  it('trims a present magic query and ignores empty', () => {
    expect(magicTokenFromSearchParam('  abc  ')).toBe('abc');
    expect(magicTokenFromSearchParam('')).toBeNull();
    expect(magicTokenFromSearchParam(null)).toBeNull();
  });

  it('claims a token once so React remounts do not double-consume', () => {
    const storage = new Map<string, string>();
    const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    };

    expect(claimMagicTokenOnce('once', fake)).toBe(true);
    expect(claimMagicTokenOnce('once', fake)).toBe(false);
    releaseMagicTokenClaim('once', fake);
    expect(claimMagicTokenOnce('once', fake)).toBe(true);
  });
});
