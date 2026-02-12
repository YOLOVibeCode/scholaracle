interface ICacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/**
 * Simple in-memory TTL cache for LLM responses.
 * Prevents redundant API calls for identical inputs.
 */
export class ResponseCache<T = string> {
  private readonly _cache = new Map<string, ICacheEntry<T>>();
  private readonly _ttlMs: number;
  private readonly _maxSize: number;

  constructor(ttlMs = 5 * 60 * 1000, maxSize = 500) {
    this._ttlMs = ttlMs;
    this._maxSize = maxSize;
  }

  public get(key: string): T | undefined {
    const entry = this._cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  public set(key: string, value: T): void {
    // Evict oldest entries if at capacity
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next();
      if (!firstKey.done) {
        this._cache.delete(firstKey.value);
      }
    }

    this._cache.set(key, {
      value,
      expiresAt: Date.now() + this._ttlMs,
    });
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public clear(): void {
    this._cache.clear();
  }

  public get size(): number {
    return this._cache.size;
  }
}
