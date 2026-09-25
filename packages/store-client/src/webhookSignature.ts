import crypto from 'crypto';

function normalizeSignature(header: string): string {
  const trimmed = header.trim();
  const eq = trimmed.indexOf('=');
  if (eq > 0 && eq < trimmed.length - 1) {
    return trimmed.slice(eq + 1).trim();
  }
  return trimmed;
}

/** Verifies HMAC-SHA256 webhook signatures (hex or base64). */
export function verifyStoreWebhookSignature(options: {
  readonly body: string;
  readonly signatureHeader: string | undefined;
  readonly webhookSecret: string;
}): boolean {
  const { body, signatureHeader, webhookSecret } = options;
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const provided = normalizeSignature(signatureHeader);
  const hexDigest = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  const base64Digest = crypto.createHmac('sha256', webhookSecret).update(body).digest('base64');

  const candidates = [provided, provided.toLowerCase()];
  for (const candidate of candidates) {
    if (
      timingSafeEqualString(candidate, hexDigest) ||
      timingSafeEqualString(candidate, hexDigest.toLowerCase()) ||
      timingSafeEqualString(candidate, base64Digest)
    ) {
      return true;
    }
  }
  return false;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
