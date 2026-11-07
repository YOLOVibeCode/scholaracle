import { test, expect } from '@playwright/test';

/** Temporary CI gate probe — reverted in the same PR after confirming a red check. */
test.describe('@critical gate probe', () => {
  test('GATE-PROBE: deliberate failure for production gate proof', () => {
    expect(1).toBe(2);
  });
});
