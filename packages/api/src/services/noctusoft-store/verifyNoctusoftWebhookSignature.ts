import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies `x-noctusoft-signature` (hex HMAC-SHA256 of raw body with webhook secret).
 * Matches noctusoft-relay store-client verification.
 */
export function verifyNoctusoftWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): boolean {
  const provided = signatureHeader.trim();
  if (!provided || !webhookSecret) {
    return false;
  }
  const expected = createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

/** Builds a signature for tests and store replay fixtures. */
export function signNoctusoftWebhookBody(rawBody: string, webhookSecret: string): string {
  return createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
}
