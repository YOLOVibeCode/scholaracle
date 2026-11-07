import { decryptRunSkeleton, encryptRunSkeleton } from './runSkeletonCipher';

const TEST_KEY = 'a'.repeat(32);

describe('runSkeletonCipher', () => {
  const prev = process.env['RUN_SKELETON_CIPHER_KEY'];

  afterEach(() => {
    if (prev === undefined) delete process.env['RUN_SKELETON_CIPHER_KEY'];
    else process.env['RUN_SKELETON_CIPHER_KEY'] = prev;
  });

  it('round-trips skeleton JSON ciphertext', () => {
    process.env['RUN_SKELETON_CIPHER_KEY'] = TEST_KEY;
    const plain = JSON.stringify({ v: 1, step: 'canvas.extract', r: { t: 'html' } });
    const enc = encryptRunSkeleton(plain);
    expect(enc).not.toBeNull();
    const out = decryptRunSkeleton(enc!);
    expect(out).toBe(plain);
    expect(out).not.toBe(plain.replace('html', 'leak'));
  });
});
