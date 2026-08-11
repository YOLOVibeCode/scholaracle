/**
 * savedLoginStore tests — persistence of login credentials in SecureStore
 * so users are prefilled after a successful login.
 */

import * as SecureStore from 'expo-secure-store';
import {
  saveLogin,
  loadSavedLogin,
  clearSavedLogin,
  clearSavedPassword,
  resolvePrefill,
} from './savedLoginStore';

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

describe('savedLoginStore hardening', () => {
  it('should write with device-only keychain accessibility', async () => {
    await saveLogin({ email: 'a@b.c', password: 'pw' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('slc_saved_login', expect.any(String), {
      keychainAccessible: 'whenUnlockedThisDeviceOnly',
    });
  });

  it('clearSavedPassword should blank the password but keep the email (case-insensitive match)', async () => {
    await saveLogin({ email: 'Demo@Scholarmancy.com', password: 'mock-stale-pw' });

    await clearSavedPassword('demo@scholarmancy.com');

    expect(await loadSavedLogin()).toEqual({ email: 'Demo@Scholarmancy.com', password: '' });
  });

  it('clearSavedPassword should not touch a different email', async () => {
    await saveLogin({ email: 'other@x.com', password: 'mock-keep-pw' });

    await clearSavedPassword('demo@scholarmancy.com');

    expect(await loadSavedLogin()).toEqual({ email: 'other@x.com', password: 'mock-keep-pw' });
  });
});

describe('resolvePrefill', () => {
  const saved = { email: 'saved@x.com', password: 'mock-saved-pw' };

  it('fills both fields when empty and untouched', () => {
    expect(
      resolvePrefill(saved, { email: '', password: '' }, { email: false, password: false })
    ).toEqual({ email: 'saved@x.com', password: 'mock-saved-pw' });
  });

  it('never overwrites an edited field, even if currently empty', () => {
    expect(
      resolvePrefill(saved, { email: '', password: '' }, { email: false, password: true })
    ).toEqual({ email: 'saved@x.com' });
  });

  it('never overwrites a non-empty field', () => {
    expect(
      resolvePrefill(
        saved,
        { email: 'typed@y.com', password: 'mock-typed-pw' },
        { email: false, password: false }
      )
    ).toEqual({});
  });

  it('skips empty saved values (a cleared password is not re-filled)', () => {
    expect(
      resolvePrefill(
        { email: 'saved@x.com', password: '' },
        { email: '', password: '' },
        { email: false, password: false }
      )
    ).toEqual({ email: 'saved@x.com' });
  });

  it('returns nothing for a null saved login', () => {
    expect(
      resolvePrefill(null, { email: '', password: '' }, { email: false, password: false })
    ).toEqual({});
  });
});
