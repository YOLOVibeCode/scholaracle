/**
 * Unit tests for useStrategy and computeFingerprint.
 */

import {
  useStrategy,
  computeFingerprint,
  type IExtractionStrategy,
  type ISelectorStep,
  type IStrategyStore,
} from './use-strategy';

function createMockStore(
  initial?: Map<string, IExtractionStrategy>
): IStrategyStore & { data: Map<string, IExtractionStrategy> } {
  const data = new Map(initial ?? []);
  return {
    data,
    async get(extractionId: string): Promise<IExtractionStrategy | null> {
      return data.get(extractionId) ?? null;
    },
    async save(strategy: IExtractionStrategy): Promise<void> {
      data.set(strategy.extractionId, strategy);
    },
    async invalidate(extractionId: string): Promise<void> {
      data.delete(extractionId);
    },
  };
}

function makeStrategy(overrides?: Partial<IExtractionStrategy>): IExtractionStrategy {
  const now = new Date().toISOString();
  return {
    extractionId: 'test:section:item',
    platform: 'test',
    selectors: [{ type: 'regex', value: 'class="([^"]+)"' }],
    version: 1,
    createdAt: now,
    updatedAt: now,
    successCount: 0,
    failCount: 0,
    ...overrides,
  };
}

describe('computeFingerprint', () => {
  it('returns deterministic hash for same structure', () => {
    const html = '<div id="x"><span class="a">Hello</span></div>';
    expect(computeFingerprint(html)).toBe(computeFingerprint(html));
  });

  it('returns different hash for different structure', () => {
    const a = '<div id="x"></div>';
    const b = '<span id="x"></span>';
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('ignores text content changes', () => {
    const a = '<div><span>Hello</span></div>';
    const b = '<div><span>World</span></div>';
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });
});

describe('useStrategy (no store)', () => {
  it('uses tryNormal when no store and tryNormal succeeds', async () => {
    const result = await useStrategy({
      extractionId: 'x',
      platform: 'test',
      tryCached: async () => null,
      tryNormal: async () => ({
        data: { value: 42 },
        selectors: [{ type: 'regex', value: 'x' }],
      }),
    });
    expect(result).toEqual({ value: 42 });
  });

  it('uses tryAi when tryNormal fails and tryAi succeeds', async () => {
    const result = await useStrategy({
      extractionId: 'x',
      platform: 'test',
      tryCached: async () => null,
      tryNormal: async () => null,
      tryAi: async () => ({
        data: { value: 99 },
        selectors: [{ type: 'ai', value: 'schema' }],
      }),
      aiSchema: 'value: number',
    });
    expect(result).toEqual({ value: 99 });
  });

  it('throws when tryNormal and tryAi both fail', async () => {
    await expect(
      useStrategy({
        extractionId: 'x',
        platform: 'test',
        tryCached: async () => null,
        tryNormal: async () => null,
        tryAi: async () => null,
        aiSchema: 'x',
      })
    ).rejects.toThrow(/Could not extract/);
  });
});

describe('useStrategy (with store, cached)', () => {
  it('returns tryCached result when cached strategy succeeds', async () => {
    const strategy = makeStrategy();
    const store = createMockStore(new Map([['x', strategy]]));
    const tryCached = jest.fn().mockResolvedValue({ value: 1 });
    const tryNormal = jest.fn();

    const result = await useStrategy({
      extractionId: 'x',
      platform: 'test',
      store,
      tryCached,
      tryNormal,
    });

    expect(result).toEqual({ value: 1 });
    expect(tryCached).toHaveBeenCalledWith(strategy);
    expect(tryNormal).not.toHaveBeenCalled();
  });

  it('invalidates and falls through when tryCached returns null', async () => {
    const strategy = makeStrategy();
    const store = createMockStore(new Map([['x', strategy]]));
    const tryCached = jest.fn().mockResolvedValue(null);
    const newSelectors = [{ type: 'regex' as const, value: 'y' }];
    const tryNormal = jest.fn().mockResolvedValue({
      data: { value: 2 },
      selectors: newSelectors,
    });

    const result = await useStrategy({
      extractionId: 'x',
      platform: 'test',
      store,
      tryCached,
      tryNormal,
    });

    expect(result).toEqual({ value: 2 });
    expect(tryCached).toHaveBeenCalledWith(strategy);
    expect(tryNormal).toHaveBeenCalled();
    expect(store.data.get('x')?.selectors).toEqual(newSelectors); // invalidated old, saved new
  });

  it('saves strategy when tryNormal succeeds after cache miss', async () => {
    const store = createMockStore();
    const selectors: ISelectorStep[] = [{ type: 'css', value: '.course' }];

    await useStrategy({
      extractionId: 'skyward:gradebook:courses',
      platform: 'skyward',
      store,
      tryCached: async () => null,
      tryNormal: async () => ({
        data: { courses: [] },
        selectors,
      }),
      htmlFingerprint: 'abc123',
    });

    const saved = store.data.get('skyward:gradebook:courses');
    expect(saved).toBeDefined();
    expect(saved!.selectors).toEqual(selectors);
    expect(saved!.platform).toBe('skyward');
    expect(saved!.htmlFingerprint).toBe('abc123');
  });
});
