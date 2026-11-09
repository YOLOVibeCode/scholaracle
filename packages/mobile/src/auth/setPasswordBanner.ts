/**
 * "Set a password" banner for accounts created by accepting a sharing invitation: the server
 * gave them a random password and flags the session with `forcePasswordReset`. The banner opens
 * the web forgot-password page (the reset flow sets the password and clears the flag server
 * side). Dismissal is remembered per user on this device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISS_KEY_PREFIX = 'slc_set_password_dismissed:';

export const SET_PASSWORD_BANNER_TITLE = 'Set a password';
export const SET_PASSWORD_BANNER_TEXT =
  'Your account was created from an invitation. Set a password so you can sign in without a link.';
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
