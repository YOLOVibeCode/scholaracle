/**
 * Contract-test helpers: assert the EXACT key set of a wire object.
 *
 * Unlike toMatchObject/spot-checks, these fail when a field is added,
 * removed, or renamed — turning silent client/server drift into a red test.
 */

/**
 * Assert `obj` has exactly `expectedKeys` (order-insensitive). Reports both
 * missing and unexpected keys in one message.
 */
export function assertExactKeys(
  obj: Record<string, unknown>,
  expectedKeys: readonly string[],
  label = 'object'
): void {
  const actual = Object.keys(obj).sort();
  const expected = [...expectedKeys].sort();
  const missing = expected.filter((k) => !actual.includes(k));
  const unexpected = actual.filter((k) => !expected.includes(k));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Contract drift in ${label}: ${
        missing.length > 0 ? `missing keys [${missing.join(', ')}] ` : ''
      }${
        unexpected.length > 0 ? `unexpected keys [${unexpected.join(', ')}] ` : ''
      }— actual keys: [${actual.join(', ')}]`
    );
  }
}

/**
 * Assert `obj` contains all of `requiredKeys` and nothing outside
 * `requiredKeys` + `optionalKeys`. Use when a response legitimately omits
 * undefined-valued optionals (JSON.stringify drops them).
 */
export function assertKeys(
  obj: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
  label = 'object'
): void {
  const actual = Object.keys(obj);
  const missing = requiredKeys.filter((k) => !actual.includes(k));
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const unexpected = actual.filter((k) => !allowed.has(k));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Contract drift in ${label}: ${
        missing.length > 0 ? `missing required keys [${missing.join(', ')}] ` : ''
      }${
        unexpected.length > 0 ? `unexpected keys [${unexpected.join(', ')}] ` : ''
      }— actual keys: [${actual.sort().join(', ')}]`
    );
  }
}
