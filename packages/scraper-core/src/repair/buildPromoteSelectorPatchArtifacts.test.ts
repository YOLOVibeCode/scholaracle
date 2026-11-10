import { applySelectorPatchToTableJson } from './buildPromoteSelectorPatchArtifacts';

describe('applySelectorPatchToTableJson', () => {
  it('merges patch keys into v1 selector table', () => {
    const raw = JSON.stringify({
      version: 1,
      selectors: { a: '1', b: '2' },
    });
    const next = applySelectorPatchToTableJson(raw, { b: '3', c: '4' });
    const parsed = JSON.parse(next) as { selectors: Record<string, string> };
    expect(parsed.selectors).toEqual({ a: '1', b: '3', c: '4' });
  });
});
