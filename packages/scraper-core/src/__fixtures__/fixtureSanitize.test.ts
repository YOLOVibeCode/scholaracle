/**
 * Synthetic fixtures must not contain known real-district markers from production captures.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const FORBIDDEN_SUBSTRINGS: readonly string[] = [
  'LAKE DALLAS',
  'KELLER ISD',
  'KELLER HIGH',
  'FRISCO ISD',
  'ALLEN ISD',
  'PLANO ISD',
];

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(html|json|txt|csv)$/i.test(name)) acc.push(p);
  }
}

describe('fixture replay sanitization', () => {
  it('fixtures under __fixtures__ contain no forbidden district markers', () => {
    const root = join(__dirname);
    const files: string[] = [];
    for (const sub of ['aeries', 'skyward', 'canvas']) {
      walk(join(root, sub), files);
    }
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        if (text.includes(bad)) violations.push(`${file}: contains "${bad}"`);
      }
    }
    expect(violations).toEqual([]);
  });
});
