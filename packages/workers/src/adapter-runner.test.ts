/**
 * Tests for createAdapterRunner — all providers are client-side sync only.
 */
import { createAdapterRunner } from './adapter-runner';

const CLIENT_SIDE_MSG = /mobile app|browser extension|local CLI/i;

describe('createAdapterRunner', () => {
  const run = createAdapterRunner();

  it.each(['canvas', 'skyward', 'aeries', 'google-classroom', 'oneroster'] as const)(
    'should reject %s with client-side sync message',
    async (provider) => {
      const result = await run(
        provider,
        `com.${provider}`,
        { username: 'u', password: 'p' },
        `https://${provider}.example.com`,
        `run-${provider}`
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(CLIENT_SIDE_MSG);
      expect(result.summary).toEqual({});
    }
  );

  it('should return error for unknown provider', async () => {
    const result = await run('unknown-provider', 'adapter.id', {}, 'https://example.com', 'run-9');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown provider');
  });
});
