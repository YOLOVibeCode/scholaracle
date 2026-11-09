/**
 * Launch-time checks, kept free of React so they can be unit-tested:
 *   1. force-update gate (min app version, fails open)
 *   2. OTA check + download (applied on the NEXT launch; never reloads mid-session)
 */

import {
  fetchMinVersionPolicy,
  isUpdateRequired,
  storeUrlFor,
  type IMinVersionPolicy,
} from '../version/minVersion';

export interface IUpdatesApi {
  readonly isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ readonly isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<unknown>;
}

export type OtaOutcome = 'skipped-dev' | 'disabled' | 'up-to-date' | 'downloaded' | 'error';

/**
 * Check for an OTA update and download it. Deliberately never calls
 * reloadAsync: the new bundle takes effect on the next cold launch, so the
 * user is never yanked out of a sync or a form.
 */
export async function checkAndFetchOta(
  updates: IUpdatesApi | null,
  isDev: boolean
): Promise<OtaOutcome> {
  if (isDev) return 'skipped-dev';
  if (!updates || !updates.isEnabled) return 'disabled';
  try {
    const check = await updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'up-to-date';
    await updates.fetchUpdateAsync();
    return 'downloaded';
  } catch {
    return 'error';
  }
}

export interface IUpdateGate {
  readonly message: string | null;
  readonly storeUrl: string | null;
}

export interface IGateDeps {
  readonly currentVersion: string | null;
  readonly currentBuild: string | null;
  readonly platform: string;
  readonly fetchPolicy?: () => Promise<IMinVersionPolicy>;
}

/** Resolves to a blocking gate, or null (no gate, or any failure: fail open). */
export async function resolveUpdateGate(deps: IGateDeps): Promise<IUpdateGate | null> {
  try {
    const policy = await (deps.fetchPolicy ?? fetchMinVersionPolicy)();
    if (!isUpdateRequired(deps.currentVersion, deps.currentBuild, policy)) return null;
    return { message: policy.message, storeUrl: storeUrlFor(policy, deps.platform) };
  } catch {
    return null;
  }
}
