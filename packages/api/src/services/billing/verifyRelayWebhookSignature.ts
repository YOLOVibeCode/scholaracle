import crypto from 'crypto';

export interface IVerifyRelaySignatureInput {
  readonly rawBody: string;
  readonly relaySignature?: string;
  readonly noctusoftSignature?: string;
  readonly webhookSecret: string;
  readonly callbackUrl: string;
}

/** Verify relay webhook HMAC (x-relay-signature or x-noctusoft-signature). */
export function verifyRelayWebhookSignature(input: IVerifyRelaySignatureInput): boolean {
  const { rawBody, relaySignature, noctusoftSignature, webhookSecret, callbackUrl } = input;

  if (relaySignature) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(callbackUrl + rawBody)
      .digest('base64');
    return timingSafeEqual(relaySignature, expected);
  }

  if (noctusoftSignature) {
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    return timingSafeEqual(noctusoftSignature, expected);
  }

  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
