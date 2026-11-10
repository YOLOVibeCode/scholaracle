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

  it('uses neutral copy: the flag is also set by admins, not only by invitations', () => {
    expect(SET_PASSWORD_BANNER_TEXT).toBe('Set a password so you can sign in next time.');
    expect(SET_PASSWORD_BANNER_TEXT).not.toMatch(/invitation/);
  });

  it('hides again once a re-read session no longer carries the flag', () => {
    expect(shouldShowSetPasswordBanner({ forcePasswordReset: true }, false)).toBe(true);
    expect(shouldShowSetPasswordBanner({ forcePasswordReset: undefined }, false)).toBe(false);
  });
});
