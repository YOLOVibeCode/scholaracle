import { randomBytes, createCipheriv } from 'node:crypto';
import { decryptRunSkeleton } from './runSkeletonCipher';

const ALGORITHM = 'aes-256-gcm';

function seal(plain: string, hexKey: string): { encrypted: string; iv: string } {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { encrypted: enc.toString('base64'), iv: iv.toString('base64') };
}

describe('decryptRunSkeleton', () => {
  const saved = process.env['RUN_SKELETON_CIPHER_KEY'];

  afterEach(() => {
    if (saved === undefined) {
      delete process.env['RUN_SKELETON_CIPHER_KEY'];
    } else {
      process.env['RUN_SKELETON_CIPHER_KEY'] = saved;
    }
  });

  it('returns null when cipher key is missing', () => {
    delete process.env['RUN_SKELETON_CIPHER_KEY'];
    delete process.env['CREDENTIALS_ENCRYPTION_KEY'];
    expect(decryptRunSkeleton({ encrypted: 'x', iv: 'y' })).toBeNull();
  });

  it('round-trips AES-GCM payload', () => {
    const hexKey = randomBytes(32).toString('hex');
    process.env['RUN_SKELETON_CIPHER_KEY'] = hexKey;
    const payload = seal('{"skeleton":"ok"}', hexKey);
    expect(decryptRunSkeleton(payload)).toBe('{"skeleton":"ok"}');
  });

  it('returns null for corrupt ciphertext', () => {
    const hexKey = randomBytes(32).toString('hex');
    process.env['RUN_SKELETON_CIPHER_KEY'] = hexKey;
    expect(decryptRunSkeleton({ encrypted: 'not-base64', iv: 'bad' })).toBeNull();
  });
});
