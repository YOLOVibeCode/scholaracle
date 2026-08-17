/**
 * Cross-platform UUID v4 generator for scraper-core.
 *
 * Priority:
 *   1. globalThis.crypto.randomUUID (browser, Node 19+, React Native via Expo)
 *   2. Pure-JS math-random fallback (non-cryptographic, for older environments)
 */

declare const crypto: { randomUUID?: () => string } | undefined;

export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
