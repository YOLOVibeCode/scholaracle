/**
 * Diag gate — overlay is inert until unlocked.
 *
 * Auto-unlocks on non-production EAS channels so testers on preview/staging
 * builds get the overlay without a 7-tap. Production App Store users never
 * unlock automatically.
 *
 * Unlock persists across relaunches via SecureStore so cold-start state is
 * correct without waiting for the UI to settle.
 */
import { Platform } from 'react-native';

const UNLOCK_KEY = 'scholarmancy_diag_unlocked';
const listeners = new Set<() => void>();

let unlocked = false;
let hydrated = false;

function emit(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

async function store(): Promise<{
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}> {
  if (Platform.OS === 'web') {
    return {
      getItemAsync: async (key: string): Promise<string | null> =>
        Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
      setItemAsync: async (key: string, value: string): Promise<void> => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      },
      deleteItemAsync: async (key: string): Promise<void> => {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

function channelIsInternal(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as { channel?: string | null };
    const ch = Updates.channel ?? '';
    return ch.length > 0 && ch !== 'production';
  } catch {
    return false;
  }
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function isGateHydrated(): boolean {
  return hydrated;
}

export function subscribeGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function hydrateGate(): Promise<boolean> {
  try {
    if (channelIsInternal()) {
      unlocked = true;
    } else {
      const s = await store();
      unlocked = (await s.getItemAsync(UNLOCK_KEY)) === '1';
    }
  } catch {
    unlocked = false;
  }
  hydrated = true;
  emit();
  return unlocked;
}

export async function unlockDiag(): Promise<void> {
  unlocked = true;
  emit();
  try {
    const s = await store();
    await s.setItemAsync(UNLOCK_KEY, '1');
  } catch {
    /* in-memory unlock still holds for this process */
  }
}

export async function lockDiag(): Promise<void> {
  unlocked = false;
  emit();
  try {
    const s = await store();
    await s.deleteItemAsync(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}
