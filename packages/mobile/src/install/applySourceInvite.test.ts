/**
 * SOURCE_INVITE.md §8.2
 */

import * as SecureStore from 'expo-secure-store';
import { SOURCE_INVITE_ADAPTER_IDS, type ISourceInvitePayload } from '@scholaracle/contracts';
import { ConnectedSourceStore } from '../sources/ConnectedSourceStore';
import { sourceInviteApplier } from './applySourceInvite';

const AVA: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-mongo-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('applySourceInvite', () => {
  beforeEach(async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.clear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
  });

  it('upserts source without writing SecureStore', async () => {
    const store = new ConnectedSourceStore();
    const source = await sourceInviteApplier.apply(AVA, store);
    expect(source.studentExternalId).toBe('ava-lewis');
    expect(source.studentExternalId).not.toBe('default');
    expect(source.sourceId).toBe('local-skyward-skyward.iscorp.com');
    expect(source.credentialKey).toBe('slc_creds_skyward_skyward.iscorp.com');
    expect(source.adapterId).toBe('com.skyward.iscorp');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(1);
  });

  it('second apply same sourceId replaces, list length 1', async () => {
    const store = new ConnectedSourceStore();
    await sourceInviteApplier.apply(AVA, store);
    await sourceInviteApplier.apply({ ...AVA, displayName: 'Updated' }, store);
    expect(await store.list()).toHaveLength(1);
  });
});
