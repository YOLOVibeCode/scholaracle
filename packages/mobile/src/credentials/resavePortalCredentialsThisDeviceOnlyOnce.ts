/**
 * One-shot migration: re-write existing portal credentials with THIS_DEVICE_ONLY
 * Keychain accessibility so older installs inherit backup exclusions.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { connectedSourceStore } from '../sources/ConnectedSourceStore';
import { saveCredential } from './saveCredential';

const MIGRATION_FLAG_KEY = 'slc_portal_cred_this_device_only_v1';

export async function resavePortalCredentialsThisDeviceOnlyOnce(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
  if (done === '1') return;

  const sources = await connectedSourceStore.list();
  for (const source of sources) {
    const raw = await SecureStore.getItemAsync(source.credentialKey);
    if (raw != null) await saveCredential(source.credentialKey, raw);
  }

  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
}
