/**
 * Credentials decryption for the worker process.
 * Mirrors packages/api/src/utils/credentialsCipher.ts (decrypt only).
 */

/* eslint-disable no-console */

import { createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const secret = process.env['CREDENTIALS_ENCRYPTION_KEY'];
  if (!secret) {
    console.error('[credentials-cipher] No CREDENTIALS_ENCRYPTION_KEY found'); // eslint-disable-line no-console
    return null;
  }
  
  console.log('[credentials-cipher] Key length:', secret.length); // eslint-disable-line no-console
  console.log('[credentials-cipher] Key first 20 chars:', secret.substring(0, 20)); // eslint-disable-line no-console
  
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    const key = Buffer.from(secret, 'hex');
    console.log('[credentials-cipher] Using hex key, first 16 bytes:', key.subarray(0, 16).toString('hex')); // eslint-disable-line no-console
    return key;
  }
  
  if (secret.length >= KEY_LENGTH) {
    const key = Buffer.from(secret, 'utf8').subarray(0, KEY_LENGTH);
    console.log('[credentials-cipher] Using UTF-8 key (truncated), first 16 bytes:', key.subarray(0, 16).toString('hex')); // eslint-disable-line no-console
    return key;
  }
  
  console.error('[credentials-cipher] Key too short:', secret.length); // eslint-disable-line no-console
  return null;
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
