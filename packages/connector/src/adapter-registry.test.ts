import { AdapterRegistry } from './adapter-registry';
import type { ILmsAdapter, ILmsCredentials } from './adapter';

function createMockAdapter(provider: string): ILmsAdapter {
  return {
    meta: {
      provider,
      adapterId: `com.${provider}.test`,
      adapterVersion: '1.0.0',
      displayName: `${provider} adapter`,
    },
    authenticate: jest.fn().mockResolvedValue(undefined),
    isAuthenticated: jest.fn().mockReturnValue(false),
    fetchEnvelope: jest.fn(),
  };
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('should create an adapter from a registered factory', () => {
    const mockAdapter = createMockAdapter('test');
    const factory = jest.fn().mockReturnValue(mockAdapter);

    registry.register('test', 'com.test.adapter', factory);

    const credentials: ILmsCredentials = { baseUrl: 'https://example.com' };
    const result = registry.create('test', 'com.test.adapter', credentials);

    expect(factory).toHaveBeenCalledWith(credentials);
    expect(result).toBe(mockAdapter);
  });

  it('should return true for has() on registered adapter', () => {
    registry.register('test', 'com.test.adapter', jest.fn());
    expect(registry.has('test', 'com.test.adapter')).toBe(true);
  });

  it('should return false for has() on unregistered adapter', () => {
    expect(registry.has('unknown', 'com.unknown.adapter')).toBe(false);
  });

  it('should throw on create() for unregistered adapter', () => {
    expect(() => registry.create('unknown', 'com.unknown.adapter', { baseUrl: '' })).toThrow(
      'No adapter registered for unknown::com.unknown.adapter'
    );
  });

  it('should replace factory on duplicate registration', () => {
    const firstAdapter = createMockAdapter('first');
    const secondAdapter = createMockAdapter('second');

    registry.register('test', 'com.test.adapter', () => firstAdapter);
    registry.register('test', 'com.test.adapter', () => secondAdapter);

    const result = registry.create('test', 'com.test.adapter', { baseUrl: '' });
    expect(result).toBe(secondAdapter);
  });
});
