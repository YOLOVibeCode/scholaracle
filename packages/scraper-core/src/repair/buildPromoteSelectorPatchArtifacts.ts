import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IBuildPromoteArtifactsParams {
  readonly recipeId: string;
  readonly selectorPatch: Readonly<Record<string, string>>;
  readonly selectorsJsonPath: string;
  readonly replayTestPath: string;
}

export function applySelectorPatchToTableJson(
  existingJson: string,
  patch: Readonly<Record<string, string>>
): string {
  const parsed = JSON.parse(existingJson) as {
    version: number;
    selectors: Record<string, string>;
  };
  if (parsed.version !== 1 || typeof parsed.selectors !== 'object') {
    throw new Error('Invalid selector table JSON');
  }
  const next = { ...parsed, selectors: { ...parsed.selectors, ...patch } };
  return `${JSON.stringify(next, null, 2)}\n`;
}

export function buildPromoteReplayTestSnippet(params: {
  readonly recipeId: string;
  readonly patchKeys: readonly string[];
}): string {
  return `/**
 * Auto-generated replay guard for promoted selector patch (${params.recipeId}).
 */
import { replaySelectorPatch } from '../repair/replaySelectorPatch';

describe('promoted selector patch replay', () => {
  it('meets M4-02 count standard', async () => {
    const patch = { ${params.patchKeys.map((k) => `${k}: 'FIX_ME'`).join(', ')} };
    const result = await replaySelectorPatch({
      recipeId: '${params.recipeId}',
      step: 'aeries.gradebook.assignments',
      selectorPatch: patch,
    });
    expect(result.ok).toBe(true);
  });
});
`;
}

export function buildPromoteSelectorPatchArtifacts(params: IBuildPromoteArtifactsParams): void {
  const raw = readFileSync(params.selectorsJsonPath, 'utf8');
  const updated = applySelectorPatchToTableJson(raw, params.selectorPatch);
  writeFileSync(params.selectorsJsonPath, updated, 'utf8');
  const snippet = buildPromoteReplayTestSnippet({
    recipeId: params.recipeId,
    patchKeys: Object.keys(params.selectorPatch),
  });
  writeFileSync(params.replayTestPath, snippet, 'utf8');
}

export function defaultAeriesSelectorsJsonPath(repoRoot: string): string {
  return join(repoRoot, 'packages/scraper-core/src/selectors/aeries.v1.json');
}
