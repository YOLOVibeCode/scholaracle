/**
 * E2E-only hook: run fake-portal recipes through ContentScriptPageDriver in the loaded extension.
 * Built into dist/e2e-conformance.js when SCHOLARMANCY_EXTENSION_E2E=1.
 */
import type { BrowserFn, IGotoOptions, IWaitOptions, IPageDriver } from '@scholaracle/scraper-core';
import { runAeriesRecipe, runSkywardRecipe } from '@scholaracle/scraper-core';
import type { IAeriesFullExtract, ISkywardFullExtract } from '@scholaracle/scraper-core';
import { ContentScriptPageDriver } from './ContentScriptPageDriver';

type ConformanceResult = IAeriesFullExtract | ISkywardFullExtract;

/**
 * Same evaluate() path as ContentScriptPageDriver, but fetches portal pages without
 * window.location navigations so the conformance kickoff survives multi-step recipes.
 */
class E2eFakePortalContentScriptDriver extends ContentScriptPageDriver implements IPageDriver {
  private trackedUrl = window.location.href;
  private linksPatched = false;
  private navChain: Promise<void> = Promise.resolve();

  override url(): string {
    return this.trackedUrl;
  }

  private installFakePortalLinkNavigation(): void {
    if (this.linksPatched) return;
    this.linksPatched = true;
    document.addEventListener(
      'click',
      (ev) => {
        const anchor = (ev.target as Element | null)?.closest('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        const next = new URL(href, this.trackedUrl).href;
        if (!/\/skyward\//.test(next) && !/\/fake-aeries\//.test(next)) return;
        ev.preventDefault();
        this.navChain = this.navChain.then(() => this.goto(next));
      },
      true
    );
  }

  override async goto(url: string, options?: IGotoOptions): Promise<void> {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`E2E fake portal fetch failed: ${res.status} ${url}`);
    const html = await res.text();
    document.open();
    document.write(html);
    document.close();
    this.trackedUrl = url;
    this.installFakePortalLinkNavigation();
    if (document.readyState !== 'complete') {
      await new Promise<void>((resolve) => {
        window.addEventListener('load', () => resolve(), { once: true });
      });
    }
    void options;
    await new Promise((r) => setTimeout(r, 150));
  }

  override async waitForLoad(options?: IWaitOptions): Promise<void> {
    await this.navChain;
    if (document.readyState === 'complete') return;
    await super.waitForLoad(options);
  }

  override async waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void> {
    const timeout = options?.timeout ?? 10000;
    const deadline = Date.now() + timeout;
    while (!this.trackedUrl.includes(pattern)) {
      if (Date.now() > deadline) throw new Error(`Timeout waiting for URL to include: ${pattern}`);
      await this.sleep(200);
    }
  }

  override async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return fn(...args) as TResult;
  }

  /** Call before recipes on the post-login DOM (no fetch goto yet). */
  prepareCurrentDocument(): void {
    this.trackedUrl = window.location.href;
    this.installFakePortalLinkNavigation();
  }
}

declare global {
  interface Window {
    __scholaracleFakePortalConformance?: {
      kickoff: (recipeId: 'aeries' | 'skyward', root: string) => void;
    };
    __scholaracleConformanceResult?: ConformanceResult;
    __scholaracleConformanceError?: string;
  }
}

const driver = new E2eFakePortalContentScriptDriver();

async function runConformance(recipeId: 'aeries' | 'skyward', root: string): Promise<ConformanceResult> {
  driver.prepareCurrentDocument();
  if (recipeId === 'aeries') {
    return runAeriesRecipe(driver, root);
  }
  return runSkywardRecipe(driver, root, { conformanceGradebookOnly: true });
}

window.__scholaracleFakePortalConformance = {
  kickoff(recipeId, root) {
    window.__scholaracleConformanceResult = undefined;
    window.__scholaracleConformanceError = undefined;
    void runConformance(recipeId, root).then(
      (r) => {
        window.__scholaracleConformanceResult = r;
      },
      (err: unknown) => {
        window.__scholaracleConformanceError = err instanceof Error ? err.message : String(err);
      }
    );
  },
};
