/**
 * Persist a portal credential blob in SecureStore with Keychain accessibility
 * that excludes iCloud Keychain backup (THIS_DEVICE_ONLY).
 */
import * as SecureStore from 'expo-secure-store';

export async function saveCredential(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
