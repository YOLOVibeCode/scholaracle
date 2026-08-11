/**
 * Full sign-out: purges every per-user artifact from the device.
 *
 * Every step is individually best-effort — a single Keychain/storage
 * failure must never leave the user "signed in" or block later purges.
 * Ordering matters twice: the server push unregistration needs the live
 * auth token (step 0, before tokens are purged), and connected sources
 * must be read BEFORE the registry is cleared (they are the only index of
 * credential SecureStore keys).
 *
 * The device id (slc_device_id) intentionally survives: it identifies the
 * device, not the user.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectedSourceStore } from '../sources/ConnectedSourceStore';
import { runLedger } from '../ledger/RunLedger';
import { apiClient } from '../api/client';
import { clearSavedLogin } from '../credentials/savedLoginStore';

const CONNECTED_SOURCES_KEY = 'slc_connected_sources';
const PUSH_TOKEN_KEY = 'slc_push_token';
const DEV_SEED_FLAG_KEY = 'slc_dev_creds_seeded_v1';

export async function fullSignOut(): Promise<void> {
  // 0. Server-side push unregistration — requires the still-valid auth token.
  await apiClient.unregisterPushToken().catch(() => undefined);

  // 1. Portal credentials — enumerate BEFORE clearing the source registry.
  const sources = await connectedSourceStore.list().catch(() => []);
  for (const source of sources) {
    await SecureStore.deleteItemAsync(source.credentialKey).catch(() => undefined);
  }

  // 2. Connected-source registry.
  await AsyncStorage.removeItem(CONNECTED_SOURCES_KEY).catch(() => undefined);

  // 3. Local run ledger.
  await runLedger.clear().catch(() => undefined);

  // 4. Push token, dev-seed flag, and the saved login form credentials
  //    (a stale saved password once resubmitted itself forever).
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(DEV_SEED_FLAG_KEY).catch(() => undefined);
  await clearSavedLogin().catch(() => undefined);

  // 5. Auth + connector tokens (access, refresh, connector v1+v2).
  //    apiClient.logout() guards each delete internally.
  await apiClient.logout().catch(() => undefined);
}
