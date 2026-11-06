import * as fs from 'node:fs';
import * as path from 'node:path';

const BANNED_SUBSTRINGS = [
  ['claude', '-', 'sonnet', '-', '4'].join(''),
  ['claude', '-', '3', '-'].join(''),
] as const;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

function monorepoRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIR_NAMES.has(dirName);
}

function isExcludedFile(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join('/');
  return normalized.includes('packages/api/src/services/scraper-generator/');
}

function collectSourceFiles(dir: string, acc: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!shouldSkipDir(ent.name)) {
        collectSourceFiles(full, acc);
      }
      continue;
    }
    const ext = path.extname(ent.name);
    if (SOURCE_EXTENSIONS.has(ext)) {
      acc.push(full);
    }
  }
}

describe('retired Claude model id guard', () => {
  it('does not reference retired ids under packages/*/src', () => {
    const root = monorepoRoot();
    const packagesDir = path.join(root, 'packages');
    const packageNames = fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    const hits: string[] = [];
    for (const pkg of packageNames) {
      const srcDir = path.join(packagesDir, pkg.name, 'src');
      if (!fs.existsSync(srcDir)) {
        continue;
      }
      const files: string[] = [];
      collectSourceFiles(srcDir, files);
      for (const filePath of files) {
        const rel = path.relative(root, filePath);
        if (isExcludedFile(rel)) {
          continue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        for (const banned of BANNED_SUBSTRINGS) {
          if (content.includes(banned)) {
            hits.push(`${rel} contains "${banned}"`);
          }
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
