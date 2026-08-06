/**
 * savedLoginStore — persists the Scholarmancy account credentials in the
 * device Keychain (SecureStore) after a successful login so the form can be
 * prefilled next time. Never synced to any server.
 */

import * as SecureStore from 'expo-secure-store';

const SAVED_LOGIN_KEY = 'slc_saved_login';

export interface ISavedLogin {
  readonly email: string;
  readonly password: string;
}

export async function saveLogin(credentials: ISavedLogin): Promise<void> {
  await SecureStore.setItemAsync(SAVED_LOGIN_KEY, JSON.stringify(credentials));
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
