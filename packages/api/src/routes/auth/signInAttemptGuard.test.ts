import {
  DEFAULT_SIGN_IN_LIMITS,
  SignInAttemptGuard,
  signInLimitsFromEnv,
  tooManySignInsMessage,
} from './signInAttemptGuard';

const MINUTE = 60_000;

function guardWith(perAccountAndAddress: number, perAddress: number) {
  let now = 0;
  const guard = new SignInAttemptGuard(
    {
      perAccountAndAddress: { maxFailures: perAccountAndAddress, windowMs: 15 * MINUTE },
      perAddress: { maxFailures: perAddress, windowMs: 15 * MINUTE },
    },
    () => now
  );
  return {
    guard,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

/** One failed sign-in: counted and left counted. */
function fail(guard: SignInAttemptGuard, email: string, address: string): boolean {
  return guard.begin(email, address).allowed;
}

describe('SignInAttemptGuard', () => {
  it('refuses an account from an address once its failed sign-ins are used up', () => {
    const { guard } = guardWith(3, 100);

    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);
    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);
    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);

    const refused = guard.begin('parent@example.com', '198.51.100.1');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(15 * 60);
  });

  it('does not refuse the same account from another address', () => {
    const { guard } = guardWith(1, 100);
    fail(guard, 'parent@example.com', '198.51.100.1');

    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);
    expect(guard.begin('parent@example.com', '198.51.100.2').allowed).toBe(true);
  });

  it('does not refuse another account from the same address', () => {
    const { guard } = guardWith(1, 100);
    fail(guard, 'parent@example.com', '198.51.100.1');

    expect(guard.begin('other@example.com', '198.51.100.1').allowed).toBe(true);
  });

  it('treats an email the same whatever its case and outer spaces', () => {
    const { guard } = guardWith(2, 100);
    fail(guard, 'Parent@Example.com', '198.51.100.1');
    fail(guard, '  parent@example.COM ', '198.51.100.1');

    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);
  });

  it('forgets the failed sign-ins of an account and address when a sign-in succeeds', () => {
    const { guard } = guardWith(3, 100);
    fail(guard, 'parent@example.com', '198.51.100.1');
    fail(guard, 'parent@example.com', '198.51.100.1');

    guard.begin('parent@example.com', '198.51.100.1').succeeded();

    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);
    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);
    expect(fail(guard, 'parent@example.com', '198.51.100.1')).toBe(true);
    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);
  });

  it('refuses every account from an address that has failed too often', () => {
    const { guard } = guardWith(10, 3);
    fail(guard, 'a@example.com', '198.51.100.1');
    fail(guard, 'b@example.com', '198.51.100.1');
    fail(guard, 'c@example.com', '198.51.100.1');

    expect(guard.begin('never-tried@example.com', '198.51.100.1').allowed).toBe(false);
    expect(guard.begin('never-tried@example.com', '198.51.100.2').allowed).toBe(true);
  });

  it('does not count a successful sign-in against its address', () => {
    const { guard } = guardWith(10, 2);

    for (let i = 0; i < 20; i += 1) {
      const attempt = guard.begin(`parent${i}@example.com`, '198.51.100.1');
      expect(attempt.allowed).toBe(true);
      attempt.succeeded();
    }
  });

  it("does not let one account's success wipe the address's failures with other accounts", () => {
    const { guard } = guardWith(10, 3);
    fail(guard, 'a@example.com', '198.51.100.1');
    fail(guard, 'b@example.com', '198.51.100.1');
    fail(guard, 'c@example.com', '198.51.100.1');

    // An attacker's own account cannot be used to start the count again: it is refused too.
    expect(guard.begin('own-account@example.com', '198.51.100.1').allowed).toBe(false);
  });

  it('gives the attempt back when it ends without a verdict on the password', () => {
    const { guard } = guardWith(1, 1);

    guard.begin('parent@example.com', '198.51.100.1').abandoned();

    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(true);
  });

  it('does not count a refused attempt against the address', () => {
    const { guard } = guardWith(1, 3);
    fail(guard, 'parent@example.com', '198.51.100.1');
    // Refused over and over: none of these was checked, so none is a failed sign-in.
    for (let i = 0; i < 10; i += 1) {
      expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);
    }

    expect(guard.begin('other@example.com', '198.51.100.1').allowed).toBe(true);
  });

  it('counts afresh when the window is over', () => {
    const { guard, advance } = guardWith(1, 100);
    fail(guard, 'parent@example.com', '198.51.100.1');
    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);

    advance(15 * MINUTE);

    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(true);
  });

  it('makes succeeded and abandoned harmless on a refused attempt', () => {
    const { guard } = guardWith(1, 100);
    fail(guard, 'parent@example.com', '198.51.100.1');
    const refused = guard.begin('parent@example.com', '198.51.100.1');

    refused.succeeded();
    refused.abandoned();

    expect(guard.begin('parent@example.com', '198.51.100.1').allowed).toBe(false);
  });

  it('counts sign-ins without a known address together', () => {
    const { guard } = guardWith(1, 100);
    fail(guard, 'parent@example.com', '');

    expect(guard.begin('parent@example.com', '').allowed).toBe(false);
  });
});

describe('DEFAULT_SIGN_IN_LIMITS', () => {
  it('allows ten failed sign-ins per account and address, and a hundred per address, in fifteen minutes', () => {
    expect(DEFAULT_SIGN_IN_LIMITS).toEqual({
      perAccountAndAddress: { maxFailures: 10, windowMs: 15 * MINUTE },
      perAddress: { maxFailures: 100, windowMs: 15 * MINUTE },
    });
  });
});

describe('signInLimitsFromEnv', () => {
  it('uses the defaults when nothing is set', () => {
    expect(signInLimitsFromEnv({})).toEqual(DEFAULT_SIGN_IN_LIMITS);
  });

  it.each(['off', 'OFF', ' off ', 'false', '0'])('turns the limit off for %j', (value) => {
    expect(signInLimitsFromEnv({ SIGN_IN_ATTEMPT_LIMIT: value })).toBeNull();
  });

  it.each(['on', 'true', '1', '', 'anything'])('keeps the limit on for %j', (value) => {
    expect(signInLimitsFromEnv({ SIGN_IN_ATTEMPT_LIMIT: value })).toEqual(DEFAULT_SIGN_IN_LIMITS);
  });
});

describe('tooManySignInsMessage', () => {
  it('says how many minutes to wait, rounded up', () => {
    expect(tooManySignInsMessage(15 * 60)).toBe(
      'Too many sign-in attempts. Try again in 15 minutes.'
    );
    expect(tooManySignInsMessage(61)).toBe('Too many sign-in attempts. Try again in 2 minutes.');
  });

  it('says "1 minute" for a minute or less', () => {
    expect(tooManySignInsMessage(60)).toBe('Too many sign-in attempts. Try again in 1 minute.');
    expect(tooManySignInsMessage(1)).toBe('Too many sign-in attempts. Try again in 1 minute.');
  });
});
