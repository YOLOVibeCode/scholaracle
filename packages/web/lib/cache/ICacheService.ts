/**
 * ICacheService Interface (ISP)
 * 
 * Small, focused interface for caching following Interface Segregation Principle.
 * Separates cache operations from data fetching logic.
 */

export interface ICacheService {
  /**
   * Get a value from cache.
   * 
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache with optional TTL.
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlSeconds - Time to live in seconds (optional)
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value from cache.
   * 
   * @param key - Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cache entries.
   */
  clear(): Promise<void>;
}

