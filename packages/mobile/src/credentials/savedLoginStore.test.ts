/**
 * savedLoginStore tests — persistence of login credentials in SecureStore
 * so users are prefilled after a successful login.
 */

import * as SecureStore from 'expo-secure-store';
import { saveLogin, loadSavedLogin, clearSavedLogin } from './savedLoginStore';

const secureStoreData = new Map<string, string>();

beforeEach(() => {
  secureStoreData.clear();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(
    async (key: string) => secureStoreData.get(key) ?? null
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    secureStoreData.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secureStoreData.delete(key);
  });
});

describe('savedLoginStore', () => {
  it('should round-trip email and password through SecureStore', async () => {
    await saveLogin({ email: 'demo@scholarmancy.com', password: 'mock-pw-1' });

    const loaded = await loadSavedLogin();
    expect(loaded).toEqual({ email: 'demo@scholarmancy.com', password: 'mock-pw-1' });
  });

  it('should return null when nothing is saved', async () => {
    await expect(loadSavedLogin()).resolves.toBeNull();
  });

  it('should return null when the stored payload is corrupt', async () => {
    secureStoreData.set('slc_saved_login', 'not-json{');

    await expect(loadSavedLogin()).resolves.toBeNull();
  });

  it('should clear saved credentials', async () => {
    await saveLogin({ email: 'demo@scholarmancy.com', password: 'mock-pw-1' });
    await clearSavedLogin();

    await expect(loadSavedLogin()).resolves.toBeNull();
  });
});
