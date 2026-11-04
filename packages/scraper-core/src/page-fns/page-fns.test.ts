import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_FNS } from './registry';
import { PAGE_FN_SOURCES } from './pageFns.generated';
import { renderPageFnSources } from './render';
import { resolvePageFn, PAGE_FN_UNREGISTERED } from './resolve';

const SRC = join(__dirname, '..');

describe('build-time page-function table', () => {
  it('is up to date with the registry (run the page-fns script if this fails)', () => {
    const committed = readFileSync(join(__dirname, 'pageFns.generated.ts'), 'utf8');
    expect(renderPageFnSources(PAGE_FNS)).toBe(committed);
  });

  it('has a parseable source for every registered function', () => {
    expect(Object.keys(PAGE_FN_SOURCES).sort()).toEqual(Object.keys(PAGE_FNS).sort());
    for (const [id, source] of Object.entries(PAGE_FN_SOURCES)) {
      expect(source).not.toMatch(/\[bytecode\]|\[native code\]/);
      // Parse only; page functions need a DOM to run.
      expect(() => new Function(`return (${source});`)).not.toThrow();
      expect(typeof new Function(`return (${source});`)()).toBe('function');
      expect(id).toMatch(/^[a-z]+\.[A-Za-z0-9]+$/);
    }
  });

  it('resolves sources without Function.prototype.toString (Hermes gate)', () => {
    // On Hermes, toString returns bytecode placeholders. Resolution must not use it.
    const original = Function.prototype.toString;
    // eslint-disable-next-line no-extend-native
    Function.prototype.toString = function hermesToString(this: unknown): string {
      return 'function f(a0) { [bytecode] }';
    };
    try {
      for (const [id, fn] of Object.entries(PAGE_FNS)) {
        const resolved = resolvePageFn(fn);
        expect(resolved.id).toBe(id);
        expect(resolved.source).toBe(PAGE_FN_SOURCES[id]);
        expect(resolved.source).not.toContain('[bytecode]');
      }
    } finally {
      // eslint-disable-next-line no-extend-native
      Function.prototype.toString = original;
    }
  });

  it('refuses an unregistered function with PAGE_FN_UNREGISTERED', () => {
    const inline = (): string => document.title;
    expect(() => resolvePageFn(inline)).toThrow(PAGE_FN_UNREGISTERED);
  });

  it('every driver.evaluate() call in the recipes passes a registered named function', () => {
    const registeredNames = new Set(Object.values(PAGE_FNS).map((fn) => fn.name));
    const recipesDir = join(SRC, 'recipes');
    const files = readdirSync(recipesDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    );
    let calls = 0;
    for (const file of files) {
      const text = readFileSync(join(recipesDir, file), 'utf8');
      expect(text).not.toMatch(/\.evaluate\(\s*(\(|async\s*\(|function\b)/);
      for (const match of text.matchAll(/\.evaluate\(\s*([A-Za-z_$][\w$]*)/g)) {
        calls += 1;
        expect(registeredNames).toContain(match[1]);
      }
    }
    expect(calls).toBeGreaterThan(20);
  });
});
