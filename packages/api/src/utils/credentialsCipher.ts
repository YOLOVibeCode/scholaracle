import { createCipheriv, randomBytes } from 'node:crypto';

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
 * The server never decrypts stored credentials — sync runs on the client device.
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
