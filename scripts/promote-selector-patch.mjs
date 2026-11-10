#!/usr/bin/env node
/**
 * Writes selector-table diff + replay test into the working tree for a human PR.
 * Usage: node scripts/promote-selector-patch.mjs --recipe aeries --key gradebook_row_class_tableView --value TableView
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function parseArgs(argv) {
  const out = { recipe: 'aeries', patch: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--recipe' && argv[i + 1]) {
      out.recipe = argv[++i];
      continue;
    }
    if (a === '--key' && argv[i + 1] && argv[i + 2] === '--value' && argv[i + 3]) {
      out.patch[argv[++i]] = argv[++i];
      continue;
    }
  }
  return out;
}

function applyPatchJson(raw, patch) {
  const parsed = JSON.parse(raw);
  parsed.selectors = { ...parsed.selectors, ...patch };
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

const { recipe, patch } = parseArgs(process.argv);
if (Object.keys(patch).length === 0) {
  console.error('Provide at least one --key <k> --value <v> pair');
  process.exit(1);
}

const tablePath = join(repoRoot, `packages/scraper-core/src/selectors/${recipe}.v1.json`);
const replayTestPath = join(
  repoRoot,
  `packages/scraper-core/src/selectors/${recipe}PromotedPatch.replay.test.ts`
);

const updated = applyPatchJson(readFileSync(tablePath, 'utf8'), patch);
writeFileSync(tablePath, updated, 'utf8');

const keys = Object.keys(patch);
const replayBody = `/**
 * Promoted selector patch replay guard (${recipe}).
 */
import { replaySelectorPatch } from '../repair/replaySelectorPatch';

describe('promoted ${recipe} selector patch', () => {
  it('meets M4-02 count standard', async () => {
    const result = await replaySelectorPatch({
      recipeId: '${recipe}',
      step: 'aeries.gradebook.assignments',
      selectorPatch: ${JSON.stringify(patch, null, 6).replace(/^/gm, '      ').trim()},
    });
    expect(result.ok).toBe(true);
  });
});
`;
writeFileSync(replayTestPath, replayBody, 'utf8');
console.log(`Updated ${tablePath} and wrote ${replayTestPath}`);
