/* eslint-disable no-console -- CLI script output */
/**
 * Writes src/page-fns/pageFns.generated.ts from src/page-fns/registry.ts.
 *   pnpm --filter @scholaracle/scraper-core page-fns          # write
 *   pnpm --filter @scholaracle/scraper-core page-fns:check    # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_FNS } from '../src/page-fns/registry';
import { renderPageFnSources } from '../src/page-fns/render';

const target = join(__dirname, '..', 'src', 'page-fns', 'pageFns.generated.ts');
const rendered = renderPageFnSources(PAGE_FNS);

if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== rendered) {
    console.error(
      'pageFns.generated.ts is stale. Run: pnpm --filter @scholaracle/scraper-core page-fns'
    );
    process.exit(1);
  }
  console.log(`pageFns.generated.ts is current (${Object.keys(PAGE_FNS).length} functions).`);
} else {
  writeFileSync(target, rendered);
  console.log(`Wrote ${Object.keys(PAGE_FNS).length} page functions to ${target}`);
}
