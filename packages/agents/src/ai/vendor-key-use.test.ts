import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Model calls go through the Noctusoft relay. `resolveLlmConfig` (llm-config.ts) is the one
 * place that may read a model vendor's key, and only as the fallback when the relay key is
 * not set.
 *
 * Until 26 Nov 2026 the API's agenda route read ANTHROPIC_API_KEY itself. With that key set
 * it called the vendor directly; with only the relay key set, as on production, its
 * summaries were silently off.
 */
const PACKAGES_DIR = join(__dirname, '../../..');
const ONLY_READER = join('agents', 'src', 'ai', 'llm-config.ts');
const VENDOR_KEY_READ =
  /process\.env\s*(?:\.|\[\s*['"])\s*(ANTHROPIC_API_KEY|AI_API_KEY|OPENAI_API_KEY)\b/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
  'ios',
  'android',
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name) && !/\.(test|spec)\.[a-z]+$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

describe('model vendor keys', () => {
  it('are read in one place only, the resolver that prefers the relay', () => {
    const readers = readdirSync(PACKAGES_DIR)
      .map((name) => join(PACKAGES_DIR, name))
      .filter((path) => statSync(path).isDirectory())
      .flatMap((path) => sourceFiles(path))
      .filter((path) => VENDOR_KEY_READ.test(readFileSync(path, 'utf8')))
      .map((path) => relative(PACKAGES_DIR, path).split(sep).join('/'));

    expect(readers).toEqual([ONLY_READER.split(sep).join('/')]);
  });
});
