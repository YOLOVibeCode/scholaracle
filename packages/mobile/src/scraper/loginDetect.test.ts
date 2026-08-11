/**
 * loginDetect tests — login-success detection and popup-navigation blocking.
 */

import { shouldTreatAsLoginSuccess, shouldBlockPopupNavigation } from './loginDetect';

const PORTAL = 'https://school.instructure.com';
const PORTAL_HOST = 'school.instructure.com';

function successParams(
  overrides: Partial<Parameters<typeof shouldTreatAsLoginSuccess>[0]> = {}
): Parameters<typeof shouldTreatAsLoginSuccess>[0] {
  return {
    url: `${PORTAL}/dashboard`,
    initialUrl: PORTAL,
    hasCompletedLoad: true,
    portalHostname: PORTAL_HOST,
    ...overrides,
  };
}

describe('shouldTreatAsLoginSuccess', () => {
  it('should accept a real post-login navigation', () => {
    expect(shouldTreatAsLoginSuccess(successParams())).toBe(true);
  });

  it('should never succeed before the first load completes', () => {
    expect(shouldTreatAsLoginSuccess(successParams({ hasCompletedLoad: false }))).toBe(false);
  });

  it.each([
    { name: 'exact initial URL', url: PORTAL },
    { name: 'initial URL with trailing slash', url: `${PORTAL}/` },
    { name: 'initial URL with host casing change', url: 'https://School.Instructure.COM' },
    { name: 'trailing slash + casing', url: 'https://SCHOOL.instructure.com/' },
  ])('should not false-positive on $name', ({ url }) => {
    expect(shouldTreatAsLoginSuccess(successParams({ url }))).toBe(false);
  });

  it('should reject /login URLs', () => {
    expect(shouldTreatAsLoginSuccess(successParams({ url: `${PORTAL}/login/canvas` }))).toBe(false);
  });

  it('should reject Google SSO interstitials', () => {
    expect(
      shouldTreatAsLoginSuccess(
        successParams({ url: 'https://accounts.google.com/o/oauth2/auth', portalHostname: '' })
      )
    ).toBe(false);
  });

  it('should reject about:blank and empty URLs', () => {
    expect(shouldTreatAsLoginSuccess(successParams({ url: 'about:blank' }))).toBe(false);
    expect(shouldTreatAsLoginSuccess(successParams({ url: '' }))).toBe(false);
  });

  it('should require exact hostname equality (subdomain mismatch rejected)', () => {
    expect(
      shouldTreatAsLoginSuccess(
        successParams({ url: 'https://evil.school.instructure.com/dashboard' })
      )
    ).toBe(false);
    expect(
      shouldTreatAsLoginSuccess(successParams({ url: 'https://other-district.example.com/home' }))
    ).toBe(false);
  });

  it('should match hostname case-insensitively when it is the same host', () => {
    expect(
      shouldTreatAsLoginSuccess(successParams({ url: 'https://School.Instructure.com/dashboard' }))
    ).toBe(true);
  });

  it('should skip the hostname check when portalHostname is empty', () => {
    expect(
      shouldTreatAsLoginSuccess(
        successParams({ url: 'https://anything.example.org/home', portalHostname: '' })
      )
    ).toBe(true);
  });

  it('should never pass an unparseable URL hostname when portalHostname is set', () => {
    // extractHostname('') === '' must NOT match everything.
    expect(shouldTreatAsLoginSuccess(successParams({ url: 'no-scheme-garbage-page' }))).toBe(false);
  });
});

const SKYWARD = 'https://family.skyward.example.com';

function popupParams(
  overrides: Partial<Parameters<typeof shouldBlockPopupNavigation>[0]> = {}
): Parameters<typeof shouldBlockPopupNavigation>[0] {
  return {
    requestUrl: `${SKYWARD}/popup/grades`,
    initialUrl: SKYWARD,
    navigationType: 'other',
    hasCompletedLoad: true,
    ...overrides,
  };
}

describe('shouldBlockPopupNavigation', () => {
  it('should block a skyward "other" navigation after the first load', () => {
    expect(shouldBlockPopupNavigation(popupParams())).toBe(true);
  });

  it('should never block before the first load completes', () => {
    expect(shouldBlockPopupNavigation(popupParams({ hasCompletedLoad: false }))).toBe(false);
    // Even the exact initial-load request shape is allowed through.
    expect(
      shouldBlockPopupNavigation(popupParams({ requestUrl: SKYWARD, hasCompletedLoad: false }))
    ).toBe(false);
  });

  it.each([
    { name: 'trailing slash variant', requestUrl: `${SKYWARD}/` },
    { name: 'host casing variant', requestUrl: 'https://Family.Skyward.Example.com' },
    { name: 'exact initial URL', requestUrl: SKYWARD },
  ])('should not block the normalized-equal initial URL ($name)', ({ requestUrl }) => {
    expect(shouldBlockPopupNavigation(popupParams({ requestUrl }))).toBe(false);
  });

  it('should not block non-"other" navigation types', () => {
    expect(shouldBlockPopupNavigation(popupParams({ navigationType: 'click' }))).toBe(false);
    expect(shouldBlockPopupNavigation(popupParams({ navigationType: 'formsubmit' }))).toBe(false);
  });

  it('should not block non-skyward URLs', () => {
    expect(
      shouldBlockPopupNavigation(popupParams({ requestUrl: 'https://other.example.com/x' }))
    ).toBe(false);
  });
});
