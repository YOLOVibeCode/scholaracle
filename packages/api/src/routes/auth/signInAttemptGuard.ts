import { AttemptLimiter } from '@scholaracle/auth';

/** How many sign-ins may fail inside one window. */
export interface ISignInLimit {
  readonly maxFailures: number;
  readonly windowMs: number;
}

export interface ISignInLimits {
  /**
   * Failed sign-ins for one account from one address. This is what stops password guessing
   * against an account. Keyed on the address too, so a stranger's wrong passwords cannot lock
   * the account's owner out from home.
   */
  readonly perAccountAndAddress: ISignInLimit;
  /**
   * Failed sign-ins from one address, whatever the account. This is what stops one address
   * from trying a few passwords on each of many accounts.
   */
  readonly perAddress: ISignInLimit;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Wide enough that people who mistype do not meet them: ten wrong passwords in a row for one
 * account, or a hundred failures from one address (a school or a mobile carrier puts many
 * people behind one address).
 */
export const DEFAULT_SIGN_IN_LIMITS: ISignInLimits = {
  perAccountAndAddress: { maxFailures: 10, windowMs: FIFTEEN_MINUTES_MS },
  perAddress: { maxFailures: 100, windowMs: FIFTEEN_MINUTES_MS },
};

/**
 * The limits this environment runs with. `SIGN_IN_ATTEMPT_LIMIT=off` (or `false`, `0`) turns
 * them off; it is the switch to reach for if the limit ever refuses people it should not.
 * Returns null when off.
 */
export function signInLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): ISignInLimits | null {
  const raw = env['SIGN_IN_ATTEMPT_LIMIT']?.trim().toLowerCase();
  if (raw === 'off' || raw === 'false' || raw === '0') return null;
  return DEFAULT_SIGN_IN_LIMITS;
}

/** What a person is told when a sign-in is refused without being checked. */
export function tooManySignInsMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/** One sign-in attempt, counted when it began. */
export interface ISignInAttempt {
  /** False means: answer 429 and do not check the password. */
  readonly allowed: boolean;
  /** Whole seconds until this account and address may try again. 0 when allowed. */
  readonly retryAfterSeconds: number;
  /** The password was right. */
  succeeded(): void;
  /** The attempt ended without a verdict on the password (a server error). */
  abandoned(): void;
}

const REFUSED_HANDLERS = {
  succeeded: (): void => undefined,
  abandoned: (): void => undefined,
};

/**
 * Counts failed sign-ins and refuses further ones once an account-and-address pair, or an
 * address, has used its allowance.
 *
 * An attempt is counted when it begins, before the password is checked, so attempts sent at
 * the same moment cannot all be checked. A wrong password needs no further call: it stays
 * counted. The counts are in memory (see AttemptLimiter).
 *
 * The address is the first `X-Forwarded-For` entry. That is safe on Railway, whose edge
 * replaces whatever the caller sent with the caller's real address (checked on 26 Nov 2026).
 * Behind a proxy that passes the caller's header through, a caller could pick a new address
 * for every attempt.
 */
export class SignInAttemptGuard {
  private readonly _pairs: AttemptLimiter;
  private readonly _addresses: AttemptLimiter;

  constructor(limits: ISignInLimits = DEFAULT_SIGN_IN_LIMITS, now?: () => number) {
    this._pairs = new AttemptLimiter({ ...limits.perAccountAndAddress, ...(now ? { now } : {}) });
    this._addresses = new AttemptLimiter({ ...limits.perAddress, ...(now ? { now } : {}) });
  }

  public begin(email: unknown, address: string): ISignInAttempt {
    const addressKey = address.trim() === '' ? 'unknown' : address.trim();
    const pairKey = `${String(email).trim().toLowerCase()}|${addressKey}`;

    const forAddress = this._addresses.begin(addressKey);
    if (!forAddress.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: forAddress.retryAfterSeconds,
        ...REFUSED_HANDLERS,
      };
    }
    const forPair = this._pairs.begin(pairKey);
    if (!forPair.allowed) {
      // Not checked, so not a failed sign-in: it must not use up the address's allowance.
      this._addresses.release(addressKey);
      return { allowed: false, retryAfterSeconds: forPair.retryAfterSeconds, ...REFUSED_HANDLERS };
    }

    let settled = false;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      succeeded: (): void => {
        if (settled) return;
        settled = true;
        this._pairs.succeed(pairKey);
        // Give back this attempt only. The address keeps its failures with other accounts, so
        // signing in to one account does not start the count again for the rest.
        this._addresses.release(addressKey);
      },
      abandoned: (): void => {
        if (settled) return;
        settled = true;
        this._pairs.release(pairKey);
        this._addresses.release(addressKey);
      },
    };
  }
}
