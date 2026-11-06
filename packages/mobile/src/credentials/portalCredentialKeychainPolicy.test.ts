/**
 * Portal credentials must use THIS_DEVICE_ONLY Keychain accessibility so
 * passwords are not included in iCloud Keychain backups. Enforced by scan.
 */
import fs from 'fs';
import path from 'path';

const INSECURE_ACCESS_PATTERN = /SecureStore\.WHEN_UNLOCKED(?!_THIS_DEVICE_ONLY)/;

const HELPERS_RELATIVE = path.join('credentials', 'saveCredential.ts');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe('portal credential Keychain policy', () => {
  it('does not use WHEN_UNLOCKED outside saveCredential helper', () => {
    const srcRoot = path.join(__dirname, '..');
    const files = listSourceFiles(srcRoot).filter((f) => {
      const base = path.basename(f);
      if (base.endsWith('.test.ts') || base.endsWith('.test.tsx')) return false;
      if (base.endsWith('.generated.ts')) return false;
      return f.endsWith('.ts') || f.endsWith('.tsx');
    });

    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(srcRoot, file);
      if (rel === HELPERS_RELATIVE) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (INSECURE_ACCESS_PATTERN.test(src)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
