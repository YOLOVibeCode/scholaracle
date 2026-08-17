/**
 * SOURCE_INVITE.md §8.1
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PendingSourceInviteStore } from './pendingSourceInviteStore';

describe('PendingSourceInviteStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('save then take returns token; take again is null', async () => {
    const store = new PendingSourceInviteStore();
    await store.save('ab'.repeat(32));
    expect(await store.take()).toBe('ab'.repeat(32));
    expect(await store.take()).toBeNull();
  });
});
