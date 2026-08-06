/**
 * Dev-only credential seed for the Helper companion.
 *
 * Rules (enforced by design + pre-commit hook):
 *   - Real secrets live in companion.env.local (gitignored) or device Keychain
 *   - Never use EXPO_PUBLIC_* for passwords (would ship in the JS bundle)
 *   - Never name companion secrets `.env*` — Expo Metro require.context would
 *     Babel-parse them and crash the bundle
 *   - Production / release builds: this module is a no-op
 *   - After seeding, credentials exist only in SecureStore
 */

import * as SecureStore from 'expo-secure-store';
import { COMPANION_DEV_SEED } from './companionDevSeed.generated';

const DEV_SEED_FLAG = 'slc_dev_creds_seeded_v1';

export interface ICompanionDevPortalSeed {
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly studentExternalId: string;
  readonly sourceId: string;
}

function credentialKey(provider: string, baseUrl: string): string {
  const domain = baseUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
  return `slc_creds_${provider}_${domain}`;
}

function seedFromProcessEnv(): ICompanionDevPortalSeed | null {
  const provider = process.env['COMPANION_PORTAL_PROVIDER'] as
    ICompanionDevPortalSeed['provider'] | undefined;
  const baseUrl = process.env['COMPANION_PORTAL_BASE_URL']?.trim();
  const username = process.env['COMPANION_PORTAL_USERNAME']?.trim();
  const password = process.env['COMPANION_PORTAL_PASSWORD'];
  const studentExternalId = process.env['COMPANION_STUDENT_EXTERNAL_ID']?.trim() ?? 'dev-student';
  const sourceId = process.env['COMPANION_SOURCE_ID']?.trim() ?? 'dev-source';

  if (!provider || !baseUrl || !username || !password) return null;
  if (!['canvas', 'skyward', 'aeries'].includes(provider)) return null;

  return { provider, baseUrl, username, password, studentExternalId, sourceId };
}

/**
 * Read seed for __DEV__ only.
 * Prefer metro-generated module (client); fall back to process.env (Jest/Node).
 */
export function readCompanionDevSeedFromEnv(): ICompanionDevPortalSeed | null {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  if (COMPANION_DEV_SEED) return COMPANION_DEV_SEED;
  return seedFromProcessEnv();
}

/**
 * One-shot: copy companion.env.local portal fields into SecureStore.
 * Idempotent via DEV_SEED_FLAG. Never writes secrets to AsyncStorage or disk logs.
 */
export async function seedSecureStoreFromDevEnv(): Promise<boolean> {
  const already = await SecureStore.getItemAsync(DEV_SEED_FLAG);
  if (already === '1') return false;

  const seed = readCompanionDevSeedFromEnv();
  if (!seed) return false;

  const key = credentialKey(seed.provider, seed.baseUrl);
  await SecureStore.setItemAsync(
    key,
    JSON.stringify({
      username: seed.username,
      password: seed.password,
      baseUrl: seed.baseUrl,
      provider: seed.provider,
      loginMethod: 'direct',
    })
  );
  await SecureStore.setItemAsync(DEV_SEED_FLAG, '1');
  return true;
}

/** Test helper: exposed key builder (no secrets). */
export function buildCredentialKeyForTests(provider: string, baseUrl: string): string {
  return credentialKey(provider, baseUrl);
}
