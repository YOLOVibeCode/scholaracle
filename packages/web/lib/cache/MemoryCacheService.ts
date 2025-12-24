/**
 * MemoryCacheService Implementation (ISP)
 * 
 * In-memory cache implementation following Interface Segregation Principle.
 * Simple, focused cache for client-side use.
 */

import type { ICacheService } from './ICacheService';

interface ICacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number | null;
}

export class MemoryCacheService implements ICacheService {
  private readonly _cache = new Map<string, ICacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this._cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this._cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this._cache.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this._cache.delete(key);
  }

  async clear(): Promise<void> {
    this._cache.clear();
  }
}

