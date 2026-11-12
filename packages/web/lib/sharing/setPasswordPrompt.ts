/**
 * One-time "Set a password" prompt for accounts created by accepting a sharing invitation
 * (sharing-spec §4.4 step 3). The account has a random password the person never saw.
 *
 * Two sign-in paths, one prompt each, never both:
 * - Password login with `forcePasswordReset` already redirects straight to the reset flow
 *   (app/login/page.tsx), so it never sets this flag.
 * - Magic-link login with `forcePasswordReset` sets the flag for THAT user; the dashboard shows a
 *   dismissible banner that links to the same reset flow. A finished reset or a logout clears it,
 *   so the prompt never follows another account signed in on the same browser.
 */

export const SET_PASSWORD_PROMPT_PREFIX = 'set_password_prompt:';

type PromptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function defaultStorage(): PromptStorage | null {
  return typeof window === 'undefined' ? null : localStorage;
}

function keyFor(userId: string): string {
  return `${SET_PASSWORD_PROMPT_PREFIX}${userId}`;
}

export function markSetPasswordPrompt(
  userId: string,
  storage: PromptStorage | null = defaultStorage()
): void {
  try {
    storage?.setItem(keyFor(userId), '1');
  } catch {
    // Storage blocked: the person can still use "Forgot password" from the login page.
  }
}

export function shouldPromptSetPassword(
  userId: string | null | undefined,
  storage: PromptStorage | null = defaultStorage()
): boolean {
  if (!userId) return false;
  try {
    return storage?.getItem(keyFor(userId)) === '1';
  } catch {
    return false;
  }
}

/** Clear the flag for one user, or every user's flag when no id is given (logout, reset done). */
export function clearSetPasswordPrompt(
  userId?: string | null,
  storage: PromptStorage | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    if (userId) {
      storage.removeItem(keyFor(userId));
      return;
    }
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(SET_PASSWORD_PROMPT_PREFIX)) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
