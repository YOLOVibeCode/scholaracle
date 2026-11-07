/**
 * loginDetect tests — login-success detection and sync failure wording.
 */

import { shouldTreatAsLoginSuccess, describeSyncFailure } from './loginDetect';

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

  it('should reject login paths in any case (Aeries LoginParent.aspx)', () => {
    expect(
      shouldTreatAsLoginSuccess(
        successParams({ url: `${PORTAL}/Student/LoginParent.aspx?page=default.aspx` })
      )
    ).toBe(false);
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

describe('describeSyncFailure', () => {
  it('calls it signed out only when the portal shows a sign-in form', () => {
    const view = describeSyncFailure({
      phase: 'portal',
      message: 'WebView eval timed out after 30000ms',
      provider: 'skyward',
      loginFormShowing: true,
    });
    expect(view.kind).toBe('signed-out');
    expect(view.title).toBe('Signed out of Skyward');
    expect(view.canSignInAgain).toBe(true);
  });

  it('shows the real reason for other portal failures, never "Session Expired"', () => {
    const view = describeSyncFailure({
      phase: 'portal',
      message: 'Gradebook link not found',
      provider: 'skyward',
      loginFormShowing: false,
    });
    expect(view.kind).toBe('portal');
    expect(view.title).toBe('Couldn\u2019t read Skyward');
    expect(view.message).toBe('Gradebook link not found');
    expect(JSON.stringify(view)).not.toMatch(/session expired/i);
    expect(view.canSignInAgain).toBe(true);
  });

  it('does not send the parent back to the portal for an upload failure', () => {
    const view = describeSyncFailure({
      phase: 'upload',
      message: 'Network request failed.',
      provider: 'canvas',
      loginFormShowing: false,
    });
    expect(view.kind).toBe('upload');
    expect(view.canSignInAgain).toBe(false);
    expect(view.message).toContain('Network request failed.');
  });

  it('describes STUDENT_MISMATCH without sending the parent back to the portal', () => {
    const view = describeSyncFailure({
      phase: 'STUDENT_MISMATCH',
      message: 'No matching child on the portal.',
      provider: 'aeries',
      loginFormShowing: false,
    });
    expect(view.kind).toBe('student-mismatch');
    expect(view.title).toBe('Student name does not match the portal');
    expect(view.message).toBe('No matching child on the portal.');
    expect(view.canSignInAgain).toBe(false);
  });

  it('falls back to a generic portal name and reason', () => {
    const view = describeSyncFailure({
      phase: undefined,
      message: '  ',
      provider: 'other',
      loginFormShowing: false,
    });
    expect(view).toEqual({
      kind: 'local',
      title: 'Sync failed',
      message: 'Unknown error',
      canSignInAgain: false,
    });
  });
});
