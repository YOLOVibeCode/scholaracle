import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { connectedSourceStore } from '../sources/ConnectedSourceStore';
import type { IConnectedSource } from '../sources/ConnectedSourceStore';
import { resavePortalCredentialsThisDeviceOnlyOnce } from './resavePortalCredentialsThisDeviceOnlyOnce';

const FLAG_KEY = 'slc_portal_cred_this_device_only_v1';

function makeSource(overrides: Partial<IConnectedSource>): IConnectedSource {
  return {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    baseUrl: 'https://school.example.com',
    sourceId: 'local-canvas-example-mongo-1',
    credentialKey: 'slc_creds_canvas_school.example.com',
    studentExternalId: 'ext-1',
    institutionExternalId: 'school.example.com',
    studentId: 'mongo-1',
    adapterVersion: '0.1.0',
    ...overrides,
  };
}

describe('resavePortalCredentialsThisDeviceOnlyOnce', () => {
  let listSpy: jest.SpiedFunction<typeof connectedSourceStore.list>;

  beforeEach(async () => {
    await AsyncStorage.clear();
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => null);
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    listSpy = jest.spyOn(connectedSourceStore, 'list');
  });

  afterEach(() => {
    listSpy.mockRestore();
  });

  it('rewrites each stored credential once and sets the migration flag', async () => {
    const payload = JSON.stringify({ username: 'u', password: 'p' });
    jest.spyOn(connectedSourceStore, 'list').mockResolvedValue([makeSource({})]);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === 'slc_creds_canvas_school.example.com' ? payload : null
    );

    await resavePortalCredentialsThisDeviceOnlyOnce();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'slc_creds_canvas_school.example.com',
      payload,
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    );
    expect(await AsyncStorage.getItem(FLAG_KEY)).toBe('1');

    (SecureStore.setItemAsync as jest.Mock).mockClear();
    await resavePortalCredentialsThisDeviceOnlyOnce();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('sets flag without writes when no credential blob exists', async () => {
    jest.spyOn(connectedSourceStore, 'list').mockResolvedValue([makeSource({})]);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await resavePortalCredentialsThisDeviceOnlyOnce();

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(FLAG_KEY)).toBe('1');
  });
});
