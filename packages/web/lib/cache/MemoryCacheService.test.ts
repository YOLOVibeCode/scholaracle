/**
 * TDD Tests for MemoryCacheService
 * 
 * Following ISP: Small, focused cache service
 */

import { MemoryCacheService } from './MemoryCacheService';

describe('MemoryCacheService (ISP)', () => {
  let cache: MemoryCacheService;

  beforeEach(() => {
    cache = new MemoryCacheService();
  });

  it('should store and retrieve values', async () => {
    await cache.set('test-key', 'test-value');
    const value = await cache.get<string>('test-key');
    expect(value).toBe('test-value');
  });

  it('should return null for non-existent keys', async () => {
    const value = await cache.get<string>('non-existent');
    expect(value).toBeNull();
  });

  it('should expire values after TTL', async () => {
    await cache.set('expiring-key', 'value', 0.1); // 100ms TTL
    await new Promise((resolve) => setTimeout(resolve, 150));
    const value = await cache.get<string>('expiring-key');
    expect(value).toBeNull();
  });

  it('should delete values', async () => {
    await cache.set('delete-key', 'value');
    await cache.delete('delete-key');
    const value = await cache.get<string>('delete-key');
    expect(value).toBeNull();
  });

  it('should clear all values', async () => {
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.clear();
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });
});

