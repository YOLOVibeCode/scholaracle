import { createHmac, timingSafeEqual } from 'node:crypto';

/** Relay inbound: base64(HMAC-SHA256(secret, publicUrl + rawBody)). */
export function verifyRelayInboundSignature(
  publicUrl: string,
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const provided = signatureHeader.trim();
  if (!provided || !secret) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(publicUrl + rawBody, 'utf8')
    .digest('base64');
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function signRelayInboundBody(publicUrl: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(publicUrl + rawBody, 'utf8')
    .digest('base64');
}
