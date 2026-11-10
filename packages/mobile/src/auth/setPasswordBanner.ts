/**
 * "Set a password" banner for a session flagged `forcePasswordReset`: an account the server
 * created from a sharing invitation (random password) or one an admin flagged. The banner opens
 * the web forgot-password page (the reset flow sets the password and clears the flag server
 * side). The flag on this device is a snapshot from the last sign-in, so the Students screen
 * re-reads the session user on launch and on every foreground and hides the banner once the
 * flag is gone. Dismissal is remembered per user on this device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISS_KEY_PREFIX = 'slc_set_password_dismissed:';

export const SET_PASSWORD_BANNER_TITLE = 'Set a password';
export const SET_PASSWORD_BANNER_TEXT = 'Set a password so you can sign in next time.';
export const SET_PASSWORD_BANNER_ACTION = 'Set password';

export function shouldShowSetPasswordBanner(
  user: { readonly forcePasswordReset?: boolean } | null | undefined,
  dismissed: boolean
): boolean {
  return user?.forcePasswordReset === true && !dismissed;
}

export function setPasswordDismissKey(userId: string): string {
  return `${DISMISS_KEY_PREFIX}${userId}`;
}

export interface ISetPasswordBannerStore {
  isDismissed(userId: string): Promise<boolean>;
  dismiss(userId: string): Promise<void>;
}

export const setPasswordBannerStore: ISetPasswordBannerStore = {
  async isDismissed(userId: string): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(setPasswordDismissKey(userId))) === '1';
    } catch {
      return false;
    }
  },
  async dismiss(userId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(setPasswordDismissKey(userId), '1');
    } catch {
      // Best effort: the banner just shows again next launch.
    }
  },
};
