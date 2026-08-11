/**
 * savedLoginStore — persists the Scholarmancy account credentials in the
 * device Keychain (SecureStore) after a successful login so the form can be
 * prefilled next time. Never synced to any server.
 *
 * Invalidation matters as much as storage: a saved password that the server
 * no longer accepts must be cleared on the resulting 401 (see LoginScreen),
 * or the form silently resubmits a dead credential forever.
 */

import * as SecureStore from 'expo-secure-store';

const SAVED_LOGIN_KEY = 'slc_saved_login';

export interface ISavedLogin {
  readonly email: string;
  readonly password: string;
}

export async function saveLogin(credentials: ISavedLogin): Promise<void> {
  // THIS_DEVICE_ONLY keeps the credential out of iCloud Keychain backups.
  // Entries written before this option inherit it on the next save.
  await SecureStore.setItemAsync(SAVED_LOGIN_KEY, JSON.stringify(credentials), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadSavedLogin(): Promise<ISavedLogin | null> {
  const raw = await SecureStore.getItemAsync(SAVED_LOGIN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ISavedLogin>;
    if (typeof parsed.email !== 'string' || typeof parsed.password !== 'string') return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

export async function clearSavedLogin(): Promise<void> {
  await SecureStore.deleteItemAsync(SAVED_LOGIN_KEY);
}

/**
 * Invalidate the stored password after the server rejected it (401), keeping
 * the email for prefill convenience. No-op when a different email is stored.
 */
export async function clearSavedPassword(email: string): Promise<void> {
  const saved = await loadSavedLogin();
  if (!saved) return;
  if (saved.email.toLowerCase() !== email.toLowerCase()) return;
  await saveLogin({ email: saved.email, password: '' });
}

export interface IPrefillDecision {
  readonly email?: string;
  readonly password?: string;
}

/**
 * Decide which fields a late-resolving saved login may fill. A field is
 * only prefilled when it is still empty AND the user has not touched it —
 * saved credentials must never overwrite what someone is typing.
 */
export function resolvePrefill(
  saved: ISavedLogin | null,
  current: { readonly email: string; readonly password: string },
  edited: { readonly email: boolean; readonly password: boolean }
): IPrefillDecision {
  if (!saved) return {};
  const decision: { email?: string; password?: string } = {};
  if (saved.email && current.email === '' && !edited.email) decision.email = saved.email;
  if (saved.password && current.password === '' && !edited.password) {
    decision.password = saved.password;
  }
  return decision;
}
