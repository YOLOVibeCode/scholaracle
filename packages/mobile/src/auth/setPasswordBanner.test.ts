import {
  SET_PASSWORD_BANNER_TEXT,
  setPasswordBannerStore,
  setPasswordDismissKey,
  shouldShowSetPasswordBanner,
} from './setPasswordBanner';

describe('set-password banner', () => {
  it('shows only for a flagged session that was not dismissed', () => {
    expect(shouldShowSetPasswordBanner({ forcePasswordReset: true }, false)).toBe(true);
    expect(shouldShowSetPasswordBanner({ forcePasswordReset: true }, true)).toBe(false);
    expect(shouldShowSetPasswordBanner({ forcePasswordReset: false }, false)).toBe(false);
    expect(shouldShowSetPasswordBanner({}, false)).toBe(false);
    expect(shouldShowSetPasswordBanner(null, false)).toBe(false);
    expect(shouldShowSetPasswordBanner(undefined, false)).toBe(false);
  });

  it('remembers a dismissal per user on this device', async () => {
    expect(setPasswordDismissKey('u1')).toBe('slc_set_password_dismissed:u1');
    expect(await setPasswordBannerStore.isDismissed('u1')).toBe(false);
    await setPasswordBannerStore.dismiss('u1');
    expect(await setPasswordBannerStore.isDismissed('u1')).toBe(true);
    expect(await setPasswordBannerStore.isDismissed('u2')).toBe(false);
  });

  it('explains why in the copy', () => {
    expect(SET_PASSWORD_BANNER_TEXT).toMatch(/created from an invitation/);
  });
});
