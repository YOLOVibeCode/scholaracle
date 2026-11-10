/**
 * Page functions run inside the portal page (Playwright evaluate, the Hermes source
 * table on the phone), where their module scope does not exist. A page function that
 * calls a module-level helper works in jsdom tests but throws on a real portal.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PAGE_FN_SOURCES } from './pageFns.generated';

const EXTRACTORS = [
  'aeries/aeries-extractors.ts',
  'skyward/skyward-extractors.ts',
  'canvas/canvas-extractors.ts',
]
  .map((f) => join(__dirname, '..', 'extractors', f))
  .concat(join(__dirname, 'captureSkeleton.ts'));

function moduleLevelNames(): Set<string> {
  const names = new Set<string>();
  for (const file of EXTRACTORS) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
      names.add(m[1]!);
    }
    for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=/gm)) {
      names.add(m[1]!);
    }
  }
  return names;
}

describe('page functions are self-contained', () => {
  it('no registered page function references another module-level function or constant', () => {
    const names = moduleLevelNames();
    const offenders: string[] = [];
    for (const [id, src] of Object.entries(PAGE_FN_SOURCES)) {
      const own = /^(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(src)?.[1];
      for (const name of names) {
        if (name !== own && new RegExp(`\\b${name}\\b`).test(src))
          offenders.push(`${id} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every page function takes at most one argument (drivers pass a single argument to the page)', () => {
    // The Playwright driver packs several arguments into one array, so a second
    // parameter arrives undefined on the desktop CLI. Asset helpers run only through
    // the mobile host, which spreads arguments; they are exempt.
    const multi = Object.entries(PAGE_FN_SOURCES)
      .filter(([id]) => !id.startsWith('assets.'))
      .filter(([, src]) => {
        const params = /^(?:async\s+)?function\s+\w+\(([^)]*)\)/.exec(src)?.[1]?.trim() ?? '';
        return params.length > 0 && params.split(',').length > 1;
      })
      .map(([id]) => id);
    expect(multi).toEqual([]);
  });
});
