import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
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

export interface IEncryptedPayload {
  readonly encrypted: string;
  readonly iv: string;
}

/**
 * Encrypt a plaintext string (e.g. JSON) for storage.
 * Returns null if CREDENTIALS_ENCRYPTION_KEY is not set or too short.
 */
export function encryptCredentials(plain: string): IEncryptedPayload | null {
  const key = getKey();
  if (!key) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt a stored payload.
 * Returns null if key is missing or decryption fails.
 */
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
