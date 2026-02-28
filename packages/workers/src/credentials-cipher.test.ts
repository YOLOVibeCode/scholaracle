/**
 * Tests for credentials decryption (AES-256-GCM). Keys from env; payloads from helper.
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { decryptCredentials } from './credentials-cipher';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function encryptWithKey(plain: string, key: Buffer): { encrypted: string; iv: string } {
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

describe('decryptCredentials', () => {
  const savedKey = process.env['CREDENTIALS_ENCRYPTION_KEY'];

  afterEach(() => {
    if (savedKey !== undefined) process.env['CREDENTIALS_ENCRYPTION_KEY'] = savedKey;
    else delete process.env['CREDENTIALS_ENCRYPTION_KEY'];
  });

  it('should return null when CREDENTIALS_ENCRYPTION_KEY is missing', () => {
    delete process.env['CREDENTIALS_ENCRYPTION_KEY'];
    const key = Buffer.alloc(32, 'a');
    const payload = encryptWithKey('{"token":"x"}', key);
    expect(decryptCredentials(payload)).toBeNull();
  });

  it('should decrypt valid payload with hex key (64 hex chars)', () => {
    const key = randomBytes(32);
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = key.toString('hex');
    const payload = encryptWithKey('{"accessToken":"secret"}', key);
    expect(decryptCredentials(payload)).toBe('{"accessToken":"secret"}');
  });

  it('should decrypt valid payload with UTF-8 key (32+ chars)', () => {
    const keyStr = 'test-32-byte-key-for-aes-256!!!!!!';
    const key = Buffer.from(keyStr, 'utf8').subarray(0, KEY_LENGTH);
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = keyStr;
    const payload = encryptWithKey('{"username":"u","password":"p"}', key);
    expect(decryptCredentials(payload)).toBe('{"username":"u","password":"p"}');
  });

  it('should return null on malformed IV (not base64)', () => {
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = 'a'.repeat(64);
    const key = Buffer.from('a'.repeat(64), 'hex');
    const payload = encryptWithKey('x', key);
    expect(decryptCredentials({ ...payload, iv: '!!!' })).toBeNull();
  });

  it('should return null on malformed encrypted (not base64)', () => {
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = 'a'.repeat(64);
    const key = Buffer.from('a'.repeat(64), 'hex');
    const payload = encryptWithKey('x', key);
    expect(decryptCredentials({ ...payload, encrypted: '!!!' })).toBeNull();
  });

  it('should return null on decryption failure (wrong key)', () => {
    const keyA = randomBytes(32);
    const keyB = randomBytes(32);
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = keyB.toString('hex');
    const payload = encryptWithKey('secret', keyA);
    expect(decryptCredentials(payload)).toBeNull();
  });
});
