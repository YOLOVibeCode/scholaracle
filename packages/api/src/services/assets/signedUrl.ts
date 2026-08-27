import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed downloadUrl is a 24h fetch ticket, never a cache key. */
export const ASSET_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Generate a signed asset URL that can be accessed without a Bearer token.
 * The signature embeds the assetId and an expiry timestamp using HMAC-SHA256.
 */
export function signAssetUrl(
  baseUrl: string,
  assetId: string,
  secret: string,
  ttlSeconds = ASSET_URL_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac('sha256', secret).update(`${assetId}:${exp}`).digest('hex');
  return `${baseUrl.replace(/\/$/, '')}/api/assets/${assetId}?sig=${sig}&exp=${exp}`;
}

/**
 * Verify a signed asset URL's signature and expiry.
 * Returns true only when the HMAC matches and exp is still in the future.
 */
export function verifyAssetSignature(
  assetId: string,
  sig: string,
  exp: string | number,
  secret: string
): boolean {
  const expNum = typeof exp === 'string' ? parseInt(exp, 10) : exp;
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', secret).update(`${assetId}:${expNum}`).digest('hex');
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
}
