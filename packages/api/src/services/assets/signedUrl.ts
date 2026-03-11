import { createHmac } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Generate a signed asset URL that can be accessed without a Bearer token.
 * The signature embeds the assetId and an expiry timestamp using HMAC-SHA256.
 */
export function signAssetUrl(
  baseUrl: string,
  assetId: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', secret).update(`${assetId}:${exp}`).digest('hex');
  return `${baseUrl.replace(/\/$/, '')}/api/assets/${assetId}?sig=${sig}&exp=${exp}`;
}

/**
 * Verify a signed asset URL's signature and expiry.
 * Returns the assetId if valid, undefined otherwise.
 */
export function verifyAssetSignature(
  assetId: string,
  sig: string,
  exp: string | number,
  secret: string
): boolean {
  const expNum = typeof exp === 'string' ? parseInt(exp, 10) : exp;
  if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', secret).update(`${assetId}:${expNum}`).digest('hex');
  return sig === expected;
}
