import { isDiagDeepLink } from './diagDeepLink';

describe('isDiagDeepLink', () => {
  it('detects scholarmancy://diag', () => {
    expect(isDiagDeepLink('scholarmancy://diag')).toBe(true);
  });

  it('detects scholarmancy:diag (no slashes)', () => {
    expect(isDiagDeepLink('scholarmancy:diag')).toBe(true);
  });

  it('detects scholarmancy:///diag/ (triple slash + trailing slash)', () => {
    expect(isDiagDeepLink('scholarmancy:///diag/')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDiagDeepLink('SCHOLARMANCY://DIAG')).toBe(true);
  });

  it('does not match scholarmancy://demo', () => {
    expect(isDiagDeepLink('scholarmancy://demo')).toBe(false);
  });

  it('does not match null', () => {
    expect(isDiagDeepLink(null)).toBe(false);
  });

  it('does not match empty string', () => {
    expect(isDiagDeepLink('')).toBe(false);
  });

  it('does not match unrelated https URLs', () => {
    expect(isDiagDeepLink('https://scholarmancy.com/diag')).toBe(false);
  });
});
