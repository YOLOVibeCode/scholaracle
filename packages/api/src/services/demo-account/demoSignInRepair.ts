/**
 * Keeps the demo household available for store review, on servers where the demo has a
 * private password.
 *
 * App Store and Google Play reviewers sign in with the demo parent account, and App Review
 * tests account deletion for real. Seed routes are off on a deployed server, so a deleted
 * demo account could not come back, and the next review would fail at sign-in.
 *
 * When `DEMO_ACCOUNT_PASSWORD` is set, a sign-in as the demo parent with exactly that
 * password first puts the household back (account, students, sample data, that password)
 * and then continues as a normal sign-in. So:
 *   - deletion really deletes, and the same sign-in works again afterwards;
 *   - the documented public demo password stops working on that server after the first
 *     repair, because every demo login is moved to the private one.
 *
 * When the variable is not set (local, CI, UAT, and production until the owner sets it),
 * this does nothing at all.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Db } from 'mongodb';
import { logger } from '../../logger';
import type { IAssetStore } from '../assets/IAssetStore';
import { DEMO_USER } from '../../routes/seed/demo-data';
import { ensureDemoHousehold, type IEnsureDemoHouseholdOptions } from '../../routes/seed/seed';

export const DEMO_ACCOUNT_PASSWORD_ENV = 'DEMO_ACCOUNT_PASSWORD';

/** Shorter values are ignored: a weak password must not become the demo's only lock. */
export const DEMO_ACCOUNT_PASSWORD_MIN_LENGTH = 12;

/** Runs before the password check of POST /api/auth/login. Must never reject. */
export type BeforeLoginHook = (email: string, password: string) => Promise<void>;

export interface IDemoSignInRepairDeps {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly assetStore?: IAssetStore;
  /** Defaults to process.env; read on every sign-in so tests and redeploys see changes. */
  readonly env?: NodeJS.ProcessEnv;
  /** Injected in tests to make the repair fail. */
  readonly ensure?: (
    config: { database: Db; jwtSecret?: string; assetStore?: IAssetStore },
    options: IEnsureDemoHouseholdOptions
  ) => Promise<void>;
}

/** The private demo password for this server, or null when the feature is off. */
export function configuredDemoPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[DEMO_ACCOUNT_PASSWORD_ENV] ?? '';
  return value.length >= DEMO_ACCOUNT_PASSWORD_MIN_LENGTH ? value : null;
}

/** Constant-time comparison that does not leak the length of the expected value. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function isDemoParentEmail(email: string): boolean {
  return email.trim().toLowerCase() === DEMO_USER.email;
}

export function createDemoSignInRepair(deps: IDemoSignInRepairDeps): BeforeLoginHook {
  const ensure = deps.ensure ?? ensureDemoHousehold;
  // One repair at a time per process: two sign-ins at once would both see "no sample data"
  // and insert it twice.
  let inFlight: Promise<void> | null = null;

  return async (email: string, password: string): Promise<void> => {
    if (typeof email !== 'string' || typeof password !== 'string') return;
    const expected = configuredDemoPassword(deps.env ?? process.env);
    if (expected === null) return;
    if (!isDemoParentEmail(email)) return;
    // Only the holder of the private password may trigger the repair. Anyone else gets the
    // normal sign-in path and its normal failure.
    if (!sameSecret(password, expected)) return;

    if (inFlight === null) {
      inFlight = ensure(
        { database: deps.database, jwtSecret: deps.jwtSecret, assetStore: deps.assetStore },
        { password: expected, restoreLogins: true }
      )
        .catch((err: unknown) => {
          // Never block a sign-in on the repair; the normal password check decides.
          logger.error(
            { err: err instanceof Error ? err.message : 'unknown error' },
            'Demo sign-in repair failed'
          );
        })
        .finally(() => {
          inFlight = null;
        });
    }
    await inFlight;
  };
}
