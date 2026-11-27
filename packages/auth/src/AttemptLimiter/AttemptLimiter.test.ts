import { AttemptLimiter } from './AttemptLimiter';

const MINUTE = 60_000;

function limiterAt(start: number, options: { maxFailures?: number; maxKeys?: number } = {}) {
  let now = start;
  const limiter = new AttemptLimiter({
    maxFailures: options.maxFailures ?? 3,
    windowMs: 15 * MINUTE,
    now: () => now,
    ...(options.maxKeys !== undefined ? { maxKeys: options.maxKeys } : {}),
  });
  return {
    limiter,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

describe('AttemptLimiter', () => {
  it('lets the allowed number of attempts through and refuses the next one', () => {
    const { limiter } = limiterAt(0);

    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(true);

    const refused = limiter.begin('k');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(15 * 60);
  });

  it('says how long is left of the window, rounded up to a whole second', () => {
    const { limiter, advance } = limiterAt(0, { maxFailures: 1 });
    limiter.begin('k');

    advance(14 * MINUTE + 59_001);

    expect(limiter.begin('k')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('answers 0 seconds to wait for an attempt it allows', () => {
    const { limiter } = limiterAt(0);

    expect(limiter.begin('k')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('counts afresh when the window is over', () => {
    const { limiter, advance } = limiterAt(0, { maxFailures: 1 });
    limiter.begin('k');
    expect(limiter.begin('k').allowed).toBe(false);

    advance(15 * MINUTE);

    expect(limiter.begin('k').allowed).toBe(true);
  });

  it('does not let refused attempts push the end of the window back', () => {
    const { limiter, advance } = limiterAt(0, { maxFailures: 1 });
    limiter.begin('k');

    advance(10 * MINUTE);
    expect(limiter.begin('k').allowed).toBe(false);
    advance(5 * MINUTE);

    expect(limiter.begin('k').allowed).toBe(true);
  });

  it('forgets a key that succeeded', () => {
    const { limiter } = limiterAt(0);
    limiter.begin('k');
    limiter.begin('k');

    limiter.succeed('k');

    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(false);
  });

  it('gives one attempt back when it is released', () => {
    const { limiter } = limiterAt(0);
    limiter.begin('k');
    limiter.begin('k');
    limiter.begin('k');

    limiter.release('k');

    expect(limiter.begin('k').allowed).toBe(true);
    expect(limiter.begin('k').allowed).toBe(false);
  });

  it('ignores a release or a success for a key it does not hold', () => {
    const { limiter } = limiterAt(0);

    limiter.release('nobody');
    limiter.succeed('nobody');

    expect(limiter.begin('nobody').allowed).toBe(true);
  });

  it('counts each key on its own', () => {
    const { limiter } = limiterAt(0, { maxFailures: 1 });
    limiter.begin('a');

    expect(limiter.begin('a').allowed).toBe(false);
    expect(limiter.begin('b').allowed).toBe(true);
  });

  it('counts an attempt before it is checked, so attempts made at once cannot outrun the limit', async () => {
    const { limiter } = limiterAt(0, { maxFailures: 5 });

    // Fifty guesses arrive together; each is counted before its (slow) check starts.
    const guesses = Array.from({ length: 50 }, async () => {
      const decision = limiter.begin('k');
      await new Promise((resolve) => setImmediate(resolve));
      return decision.allowed;
    });
    const checked = (await Promise.all(guesses)).filter(Boolean);

    expect(checked).toHaveLength(5);
  });

  it('keeps no more keys than its bound, dropping the windows that end soonest', () => {
    const { limiter, advance } = limiterAt(0, { maxFailures: 1, maxKeys: 2 });
    limiter.begin('first');
    advance(1000);
    limiter.begin('second');
    advance(1000);

    limiter.begin('third');

    expect(limiter.size).toBe(2);
    // 'first' was dropped to make room, so it is counted afresh; the other two are still held.
    expect(limiter.begin('second').allowed).toBe(false);
    expect(limiter.begin('third').allowed).toBe(false);
  });

  it('drops windows that are over before it drops live ones', () => {
    const { limiter, advance } = limiterAt(0, { maxFailures: 1, maxKeys: 2 });
    limiter.begin('old');
    advance(14 * MINUTE);
    limiter.begin('live');
    advance(2 * MINUTE); // 'old' is over, 'live' is not

    limiter.begin('new');

    expect(limiter.size).toBe(2);
    expect(limiter.begin('live').allowed).toBe(false);
  });

  it('refuses limits that would let nothing or everything through', () => {
    expect(() => new AttemptLimiter({ maxFailures: 0, windowMs: MINUTE })).toThrow();
    expect(() => new AttemptLimiter({ maxFailures: 3, windowMs: 0 })).toThrow();
  });
});
