import {
  canLinkToWebPlans,
  isUsStorefrontLocale,
  resolvedDeviceLocale,
} from './usStorefrontLocale';

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

describe('canLinkToWebPlans', () => {
  it.each([
    ['ios', 'en-US', true],
    ['ios', 'en_US', true],
    ['ios', 'en-GB', false],
    ['ios', 'es-MX', false],
    // Google Play: no outbound purchase links without enrolling in its program.
    ['android', 'en-US', false],
    ['android', 'en-GB', false],
    ['web', 'en-US', false],
    ['', 'en-US', false],
  ])('%s + %s → %s', (platformOs, locale, expected) => {
    expect(canLinkToWebPlans(platformOs, locale)).toBe(expected);
  });
});
