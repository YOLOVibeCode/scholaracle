/**
 * fullSignOut tests — every per-user artifact class must be purged, and
 * credential keys must be read BEFORE the source registry is cleared.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectedSourceStore, type IConnectedSource } from '../sources/ConnectedSourceStore';
import { runLedger } from '../ledger/RunLedger';
import { fullSignOut } from './signOut';
import { apiClient } from '../api/client';

const secureStoreData = new Map<string, string>();

function wireSecureStoreMock(): void {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(
    async (key: string) => secureStoreData.get(key) ?? null
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    secureStoreData.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secureStoreData.delete(key);
  });
}

function makeSource(overrides: Partial<IConnectedSource> = {}): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    baseUrl: 'https://school.example.com',
    sourceId: 'local-canvas-school',
    credentialKey: 'slc_creds_canvas_school.example.com',
    studentExternalId: 'stu-1',
    institutionExternalId: 'school.example.com',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

describe('fullSignOut', () => {
  it('should unregister push server-side BEFORE purging auth tokens', async () => {
    const order: string[] = [];
    const unregisterSpy = jest
      .spyOn(apiClient, 'unregisterPushToken')
      .mockImplementation(async () => {
        order.push('unregister');
      });
    const logoutSpy = jest.spyOn(apiClient, 'logout').mockImplementation(async () => {
      order.push('logout');
    });

    await fullSignOut();

    expect(order).toEqual(['unregister', 'logout']);
    unregisterSpy.mockRestore();
    logoutSpy.mockRestore();
  });

  it('should purge the saved login credentials', async () => {
    secureStoreData.set('slc_saved_login', JSON.stringify({ email: 'a@b.c', password: 'pw' }));
    jest.spyOn(apiClient, 'unregisterPushToken').mockRejectedValue(new Error('offline'));

    await fullSignOut();

    expect(secureStoreData.has('slc_saved_login')).toBe(false);
    jest.restoreAllMocks();
  });

  it('should complete every purge even when individual steps throw', async () => {
    jest.spyOn(apiClient, 'unregisterPushToken').mockRejectedValue(new Error('offline'));
    jest.spyOn(apiClient, 'logout').mockRejectedValue(new Error('keychain locked'));
    secureStoreData.set('slc_push_token', 'tok');

    await expect(fullSignOut()).resolves.toBeUndefined();

    expect(secureStoreData.has('slc_push_token')).toBe(false);
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    secureStoreData.clear();
    wireSecureStoreMock();
    await AsyncStorage.clear();
    // No test in this file may leave the process: unmocked fullSignOut steps
    // (unregisterPushToken, logout) fetch against the PROD API by default,
    // which once hung this suite past its timeout during a live deploy.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      text: async () => '',
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should purge credentials, sources, ledger, push token, and auth tokens', async () => {
    // Arrange: a fully-populated device
    await connectedSourceStore.upsert(makeSource());
    await connectedSourceStore.upsert(
      makeSource({ sourceId: 'local-skyward-x', credentialKey: 'slc_creds_skyward_x' })
    );
    secureStoreData.set('slc_creds_canvas_school.example.com', '{"password":"secret"}');
    secureStoreData.set('slc_creds_skyward_x', '{"password":"secret2"}');
    secureStoreData.set('slc_access_token', 'jwt');
    secureStoreData.set('slc_refresh_token', 'rt');
    secureStoreData.set('slc_connector_token_v2', '{"token":"ct"}');
    secureStoreData.set('slc_push_token', 'ExponentPushToken[x]');
    secureStoreData.set('slc_dev_creds_seeded_v1', '1');
    secureStoreData.set('slc_device_id', 'device-uuid-1');
    await runLedger.startRun({
      runId: 'r1',
      provider: 'canvas',
      studentExternalId: 'stu-1',
    });

    // Act
    await fullSignOut();

    // Assert: every per-user key class is gone
    expect(secureStoreData.has('slc_creds_canvas_school.example.com')).toBe(false);
    expect(secureStoreData.has('slc_creds_skyward_x')).toBe(false);
    expect(secureStoreData.has('slc_access_token')).toBe(false);
    expect(secureStoreData.has('slc_refresh_token')).toBe(false);
    expect(secureStoreData.has('slc_connector_token_v2')).toBe(false);
    expect(secureStoreData.has('slc_push_token')).toBe(false);
    expect(secureStoreData.has('slc_dev_creds_seeded_v1')).toBe(false);
    expect(await connectedSourceStore.list()).toEqual([]);
    expect(await runLedger.getAll()).toEqual([]);
    // Device id survives — it identifies the device, not the user
    expect(secureStoreData.get('slc_device_id')).toBe('device-uuid-1');
  });

  it('should read credential keys BEFORE clearing the source registry', async () => {
    await connectedSourceStore.upsert(makeSource());
    secureStoreData.set('slc_creds_canvas_school.example.com', '{"password":"secret"}');

    await fullSignOut();

    // If the registry were cleared first, the credential key would be
    // unenumerable and the secret would survive.
    expect(secureStoreData.has('slc_creds_canvas_school.example.com')).toBe(false);
  });
});
