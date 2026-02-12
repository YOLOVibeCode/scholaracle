import { ResponseCache } from './response-cache';

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache(1000, 3); // 1s TTL, max 3 entries
  });

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      cache.set('key1', 'old');
      cache.set('key1', 'new');
      expect(cache.get('key1')).toBe('new');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const shortCache = new ResponseCache(50, 100); // 50ms TTL
      shortCache.set('key', 'value');
      expect(shortCache.get('key')).toBe('value');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(shortCache.get('key')).toBeUndefined();
          resolve();
        }, 60);
      });
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      // At capacity (3), adding one more should evict 'a'
      cache.set('d', '4');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('2');
      expect(cache.get('d')).toBe('4');
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key', 'val');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('nope')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should reflect the number of entries', () => {
      expect(cache.size).toBe(0);
      cache.set('a', '1');
      expect(cache.size).toBe(1);
      cache.set('b', '2');
      expect(cache.size).toBe(2);
    });
  });
});
