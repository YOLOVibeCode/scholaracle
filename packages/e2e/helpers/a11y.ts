import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Run axe-core against the current page and assert zero serious/critical violations.
 *
 * @example
 *   await expectNoA11yViolations(page);
 *   await expectNoA11yViolations(page, { include: ['main'], exclude: ['#third-party-widget'] });
 *
 * NOTE: axe-core findings are fail-the-build only at impact `serious` and `critical`
 * by default. Pass `failOn` to widen.
 */
export interface IA11yOptions {
  /** CSS selectors to include. Defaults to whole document. */
  readonly include?: ReadonlyArray<string>;
  /** CSS selectors to exclude (e.g. third-party iframes). */
  readonly exclude?: ReadonlyArray<string>;
  /** Disable specific rules (e.g. ['color-contrast']). Use sparingly. */
  readonly disableRules?: ReadonlyArray<string>;
  /** Impact levels that fail the assertion. Default: serious + critical. */
  readonly failOn?: ReadonlyArray<'minor' | 'moderate' | 'serious' | 'critical'>;
}

export async function expectNoA11yViolations(
  page: Page,
  opts: IA11yOptions = {}
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);

  if (opts.include && opts.include.length > 0) {
    for (const sel of opts.include) {
      builder = builder.include(sel);
    }
  }
  if (opts.exclude && opts.exclude.length > 0) {
    for (const sel of opts.exclude) {
      builder = builder.exclude(sel);
    }
  }
  if (opts.disableRules && opts.disableRules.length > 0) {
    builder = builder.disableRules([...opts.disableRules]);
  }

  const results = await builder.analyze();

  const failOn = new Set(opts.failOn ?? ['serious', 'critical']);
  const isBlocking = results.violations.filter((v) => failOn.has(v.impact ?? 'minor'));

  // Surface helpful diagnostics on failure.
  if (isBlocking.length > 0) {
    const summary = isBlocking
      .map(
        (v) =>
          `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.helpUrl}`
      )
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\nAxe violations:\n${summary}\n`);
  }

  expect(isBlocking, `expected zero serious/critical a11y violations`).toEqual([]);
}
