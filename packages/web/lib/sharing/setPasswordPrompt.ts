/**
 * One-time "Set a password" prompt for accounts created by accepting a sharing invitation
 * (sharing-spec §4.4 step 3). The account has a random password the person never saw.
 *
 * Two sign-in paths, one prompt each, never both:
 * - Password login with `forcePasswordReset` already redirects straight to the reset flow
 *   (app/login/page.tsx), so it never sets this flag.
 * - Magic-link login with `forcePasswordReset` sets the flag; the dashboard shows a dismissible
 *   banner that links to the same reset flow. A finished reset clears it.
 */

export const SET_PASSWORD_PROMPT_KEY = 'set_password_prompt';

type PromptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): PromptStorage | null {
  return typeof window === 'undefined' ? null : localStorage;
}

export function markSetPasswordPrompt(storage: PromptStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(SET_PASSWORD_PROMPT_KEY, '1');
  } catch {
    // Storage blocked: the person can still use "Forgot password" from the login page.
  }
}

export function shouldPromptSetPassword(storage: PromptStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SET_PASSWORD_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSetPasswordPrompt(storage: PromptStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(SET_PASSWORD_PROMPT_KEY);
  } catch {
    // Nothing to clear.
  }
}
