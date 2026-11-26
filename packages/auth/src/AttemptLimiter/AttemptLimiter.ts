/** What the limiter says about one attempt. */
export interface IAttemptDecision {
  /** False means: refuse the attempt without checking it. */
  readonly allowed: boolean;
  /** Whole seconds until the window ends and attempts are counted afresh. 0 when allowed. */
  readonly retryAfterSeconds: number;
}

/**
 * Counts attempts that may be guesses (a password, an authenticator code) and refuses
 * further ones once a key has used its allowance.
 */
export interface IAttemptLimiter {
  /**
   * Count one attempt for `key` BEFORE it is checked. Refused attempts are not counted.
   * An attempt that turns out wrong needs no further call: it stays counted.
   */
  begin(key: string): IAttemptDecision;
  /** The attempt was right: forget everything counted for `key`. */
  succeed(key: string): void;
  /** The attempt was not a guess after all (or was right, for a key shared by many): give it back. */
  release(key: string): void;
}

export interface IAttemptLimiterOptions {
  /** Attempts that may fail inside one window. */
  readonly maxFailures: number;
  /** Length of a window, measured from its first counted attempt. */
  readonly windowMs: number;
  /** Clock, for tests. */
  readonly now?: () => number;
  /** Most keys held at once. The windows that end soonest are dropped first. */
  readonly maxKeys?: number;
}

interface IWindow {
  count: number;
  readonly endsAt: number;
}

const DEFAULT_MAX_KEYS = 100_000;

/**
 * In-memory attempt limiter with fixed windows.
 *
 * `begin` is synchronous and counts first, so attempts that arrive together cannot all be
 * checked before the first failure is recorded.
 *
 * The counts live in this process: they start again when the service restarts, and each
 * instance of a service keeps its own. That is acceptable for a guess limit (a restart hands an
 * attacker one extra window) and it must stay in mind if a service is ever run as several
 * instances.
 */
export class AttemptLimiter implements IAttemptLimiter {
  private readonly _maxFailures: number;
  private readonly _windowMs: number;
  private readonly _now: () => number;
  private readonly _maxKeys: number;
  /** Insertion order is window order: every window is the same length. */
  private readonly _windows = new Map<string, IWindow>();

  constructor(options: IAttemptLimiterOptions) {
    if (!Number.isInteger(options.maxFailures) || options.maxFailures < 1) {
      throw new Error('AttemptLimiter: maxFailures must be a whole number of at least 1');
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new Error('AttemptLimiter: windowMs must be greater than 0');
    }
    this._maxFailures = options.maxFailures;
    this._windowMs = options.windowMs;
    this._now = options.now ?? Date.now;
    this._maxKeys = Math.max(1, options.maxKeys ?? DEFAULT_MAX_KEYS);
  }

  /** Keys held right now (for tests and diagnostics). */
  public get size(): number {
    return this._windows.size;
  }

  public begin(key: string): IAttemptDecision {
    const now = this._now();
    const open = this._openWindow(key, now);

    if (!open) {
      this._makeRoom(now);
      this._windows.set(key, { count: 1, endsAt: now + this._windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (open.count >= this._maxFailures) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((open.endsAt - now) / 1000)),
      };
    }
    open.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public succeed(key: string): void {
    this._windows.delete(key);
  }

  public release(key: string): void {
    const open = this._openWindow(key, this._now());
    if (!open) return;
    open.count -= 1;
    if (open.count <= 0) this._windows.delete(key);
  }

  /** The key's window if it has one that is not over yet. A window that is over is dropped. */
  private _openWindow(key: string, now: number): IWindow | undefined {
    const window = this._windows.get(key);
    if (!window) return undefined;
    if (window.endsAt <= now) {
      this._windows.delete(key);
      return undefined;
    }
    return window;
  }

  /** Keep the map inside its bound: windows that are over go first, then the oldest live ones. */
  private _makeRoom(now: number): void {
    if (this._windows.size < this._maxKeys) return;
    for (const [key, window] of this._windows) {
      if (window.endsAt <= now) this._windows.delete(key);
    }
    while (this._windows.size >= this._maxKeys) {
      const oldest = this._windows.keys().next();
      if (oldest.done) return;
      this._windows.delete(oldest.value);
    }
  }
}
