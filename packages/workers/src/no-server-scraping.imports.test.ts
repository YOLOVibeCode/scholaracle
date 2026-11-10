import * as fs from 'node:fs';
import * as path from 'node:path';

const FORBIDDEN_SERVER_SCRAPING_IMPORTS = [
  'SyncWorker',
  'SyncScheduler',
  'scraper-generator',
  '@scholaracle/scraper-playwright',
  'decryptCredentials',
  'SkywardClient',
  'SkywardAdapter',
  'CanvasClient',
  'CanvasAdapter',
  'GoogleClassroomClient',
  'GoogleClassroomAdapter',
  'OneRosterClient',
  'OneRosterAdapter',
  'adapter-registry',
  'fixture-adapter-wrapper',
  'MongoStrategyStore',
  'createAdapterRunner',
  'credentials-cipher',
] as const;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist']);

function collectSourceFiles(dir: string, acc: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(ent.name)) {
        collectSourceFiles(full, acc);
      }
      continue;
    }
    if (ent.name.endsWith('.test.ts') || ent.name.endsWith('.test.tsx')) {
      continue;
    }
    const ext = path.extname(ent.name);
    if (SOURCE_EXTENSIONS.has(ext)) {
      acc.push(full);
    }
  }
}

function isImportLikeLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('import ') ||
    (t.startsWith('export ') && t.includes(' from ')) ||
    t.startsWith('require(') ||
    t.includes('import(')
  );
}

describe('no server-side scraping imports (workers)', () => {
  it('no production source file imports a forbidden portal/sync/scrape path', () => {
    const srcRoot = path.join(__dirname, '.');
    const files: string[] = [];
    collectSourceFiles(srcRoot, files);
    const hits: string[] = [];
    for (const filePath of files) {
      const rel = path.relative(srcRoot, filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!isImportLikeLine(line)) {
          continue;
        }
        for (const token of FORBIDDEN_SERVER_SCRAPING_IMPORTS) {
          if (line.includes(token)) {
            hits.push(`${rel}:${i + 1} imports "${token}"`);
          }
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
