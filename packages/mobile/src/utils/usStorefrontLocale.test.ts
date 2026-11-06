import { isUsStorefrontLocale, resolvedDeviceLocale } from './usStorefrontLocale';

describe('resolvedDeviceLocale', () => {
  it('returns a non-empty locale string', () => {
    expect(resolvedDeviceLocale().length).toBeGreaterThan(0);
  });
});

describe('isUsStorefrontLocale', () => {
  it.each([
    ['en-US', true],
    ['en_us', true],
    ['en-US-POSIX', true],
    ['en-GB', false],
    ['fr-FR', false],
    ['', false],
  ])('%s → %s', (locale, expected) => {
    expect(isUsStorefrontLocale(locale)).toBe(expected);
  });
});
