import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sameSecret } from './sameSecret';

describe('sameSecret', () => {
  it('accepts the same value', () => {
    expect(sameSecret('correct-horse-battery', 'correct-horse-battery')).toBe(true);
  });

  it('rejects a different value of the same length', () => {
    expect(sameSecret('correct-horse-batterx', 'correct-horse-battery')).toBe(false);
  });

  it('rejects a value that only starts like the expected one, or continues past it', () => {
    expect(sameSecret('correct-horse', 'correct-horse-battery')).toBe(false);
    expect(sameSecret('correct-horse-battery-staple', 'correct-horse-battery')).toBe(false);
  });

  it('rejects a missing or empty given value', () => {
    expect(sameSecret(undefined, 'correct-horse-battery')).toBe(false);
    expect(sameSecret(null, 'correct-horse-battery')).toBe(false);
    expect(sameSecret('', 'correct-horse-battery')).toBe(false);
  });

  it('rejects a given value that is not a string, such as a header sent as a list', () => {
    expect(sameSecret(['correct-horse-battery'], 'correct-horse-battery')).toBe(false);
    expect(sameSecret(12345, '12345')).toBe(false);
  });

  it('never matches when nothing is expected, even against an empty given value', () => {
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret(undefined, undefined)).toBe(false);
    expect(sameSecret('anything', undefined)).toBe(false);
    expect(sameSecret('anything', null)).toBe(false);
    expect(sameSecret('anything', '')).toBe(false);
  });

  it('compares the whole value, including characters outside ASCII', () => {
    expect(sameSecret('clé-secrète-ñ', 'clé-secrète-ñ')).toBe(true);
    expect(sameSecret('cle-secrete-n', 'clé-secrète-ñ')).toBe(false);
  });
});

/**
 * How long a comparison takes cannot be asserted in a unit test, so this pins the
 * property at the source: every place that checks a shared secret goes through
 * `sameSecret`, and none compares it with `===` or `!==`.
 */
describe('shared-secret checks', () => {
  const apiSrc = join(__dirname, '..');
  const read = (relativePath: string): string => readFileSync(join(apiSrc, relativePath), 'utf8');

  it('the internal sign-in secret is compared with sameSecret', () => {
    const source = read('routes/auth/auth.ts');
    expect(source).toMatch(/sameSecret\([^)]*INTERNAL_API_SECRET/);
    expect(source).not.toMatch(/secret\s*[!=]==\s*expected/);
  });

  it('the delivery-status webhook secret is compared with sameSecret', () => {
    const source = read('routes/webhooks/communications/communications.ts');
    expect(source).toMatch(/sameSecret\(provided,\s*secret\)/);
    expect(source).not.toMatch(/provided\s*[!=]==\s*secret/);
  });

  it('the demo sign-in repair uses the shared helper, not a copy of its own', () => {
    const source = read('services/demo-account/demoSignInRepair.ts');
    expect(source).toMatch(/from '\.\.\/\.\.\/security\/sameSecret'/);
    expect(source).not.toMatch(/function sameSecret/);
    expect(source).not.toMatch(/timingSafeEqual/);
  });
});
