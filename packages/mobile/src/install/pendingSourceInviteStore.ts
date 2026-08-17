/**
 * SOURCE_INVITE.md §8.1 — stash token until login.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IPendingSourceInviteStore } from './types';

const KEY = 'slc_pending_source_invite';

export class PendingSourceInviteStore implements IPendingSourceInviteStore {
  async save(token: string): Promise<void> {
    await AsyncStorage.setItem(KEY, token);
  }

  async take(): Promise<string | null> {
    const value = await AsyncStorage.getItem(KEY);
    if (value) await AsyncStorage.removeItem(KEY);
    return value;
  }
}

export const pendingSourceInviteStore = new PendingSourceInviteStore();
