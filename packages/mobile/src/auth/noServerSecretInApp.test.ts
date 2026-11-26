/**
 * Nothing the app is built with is private: every `EXPO_PUBLIC_*` value is compiled into
 * the bundle, and anyone with the app can read it. So the app must never carry a server
 * secret. In particular it must not hold the API's internal sign-in secret, which the API
 * trusts to say who a person is. Enforced by scan.
 */
import fs from 'fs';
import path from 'path';

const SECRET_NAMED_PUBLIC_VARIABLE = /EXPO_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE)[A-Z0-9_]*/g;
const INTERNAL_SECRET_HEADER = /x-internal-api-secret/i;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function appSourceFiles(): string[] {
  const packageRoot = path.join(__dirname, '..', '..');
  const srcRoot = path.join(packageRoot, 'src');
  const shipped = listSourceFiles(srcRoot).filter((file) => {
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.tsx')) return false;
    return file.endsWith('.ts') || file.endsWith('.tsx');
  });
  return [...shipped, path.join(packageRoot, 'App.tsx'), path.join(packageRoot, 'index.ts')];
}

describe('no server secret in the app', () => {
  const packageRoot = path.join(__dirname, '..', '..');

  it('reads no EXPO_PUBLIC_ variable that is named like a secret', () => {
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      const names = fs.readFileSync(file, 'utf8').match(SECRET_NAMED_PUBLIC_VARIABLE) ?? [];
      for (const name of names) offenders.push(`${path.relative(packageRoot, file)}: ${name}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never sends the internal sign-in secret header', () => {
    const offenders = appSourceFiles()
      .filter((file) => INTERNAL_SECRET_HEADER.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(packageRoot, file));
    expect(offenders).toEqual([]);
  });
});
