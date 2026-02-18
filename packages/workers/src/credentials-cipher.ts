/**
 * Credentials decryption for the worker process.
 * Mirrors packages/api/src/utils/credentialsCipher.ts (decrypt only).
 */

import { createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const secret = process.env['CREDENTIALS_ENCRYPTION_KEY'];
  if (!secret) return null;
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return secret.length >= KEY_LENGTH ? Buffer.from(secret, 'utf8').subarray(0, KEY_LENGTH) : null;
}

export function decryptCredentials(payload: { encrypted: string; iv: string }): string | null {
  const key = getKey();
  if (!key) return null;
  try {
    const iv = Buffer.from(payload.iv, 'base64');
    const buf = Buffer.from(payload.encrypted, 'base64');
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const data = buf.subarray(0, buf.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    return null;
  }
}
