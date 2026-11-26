import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * True when `given` is the same non-empty string as `expected`.
 *
 * Both values are hashed before they are compared, so the check takes the same time
 * whatever the two strings are and does not reveal how long the expected one is.
 * A missing or empty value on either side never matches, so an unset secret cannot be
 * satisfied by an empty header.
 */
export function sameSecret(given: unknown, expected: string | null | undefined): boolean {
  if (typeof given !== 'string' || given === '') return false;
  if (typeof expected !== 'string' || expected === '') return false;
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
