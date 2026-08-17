/**
 * IPageDriver implementation for browser extension content scripts.
 *
 * Runs in the page context — no browser automation needed.
 * Uses document APIs directly and navigates via window.location.
 *
 * ## waitUntil semantics
 * `goto()` waits for the `load` event. For SPAs that navigate without a full
 * page reload (e.g. Skyward hash routing), callers should use
 * `waitForUrlIncludes()` after goto instead of relying on load events.
 *
 * ## onNewPage / popup degradation
 * `onNewPage` is a no-op here. Extension content scripts cannot intercept
 * popup windows. Recipes that open popups (e.g. Skyward's gradeInfoDialog
 * click) MUST degrade gracefully when the dialog doesn't appear in-page —
 * `extractSkywardCourseAssignments` handles this by returning `[]` when
 * `#gradeInfoDialog` is absent. Do NOT rely on `onNewPage` in extension
 * context; that interface is only honoured by Playwright and mobile WebView.
 */

import type { IPageDriver, IGotoOptions, IWaitOptions, BrowserFn } from '@scholaracle/scraper-core';

export class ContentScriptPageDriver implements IPageDriver {
  private _url: string = window.location.href;

  async goto(url: string, _options?: IGotoOptions): Promise<void> {
    window.location.href = url;
    // Wait for navigation to complete
    await new Promise<void>((resolve) => {
      const onLoad = (): void => {
        window.removeEventListener('load', onLoad);
        this._url = window.location.href;
        resolve();
      };
      window.addEventListener('load', onLoad);
    });
  }

  url(): string {
    return window.location.href;
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fn(...args) as TResult;
  }

  async content(): Promise<string> {
    return document.documentElement.outerHTML;
  }

  async waitForLoad(_options?: IWaitOptions): Promise<void> {
    if (document.readyState === 'complete') return;
    await new Promise<void>((resolve) => {
      window.addEventListener('load', () => resolve(), { once: true });
    });
  }

  async waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void> {
    const timeout = options?.timeout ?? 10000;
    const deadline = Date.now() + timeout;
    while (!window.location.href.includes(pattern)) {
      if (Date.now() > deadline) throw new Error(`Timeout waiting for URL to include: ${pattern}`);
      await this.sleep(200);
    }
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onNewPage(_handler: (page: IPageDriver) => Promise<void>): void {
    // No-op: extension content scripts cannot intercept popup windows.
    // See module-level JSDoc for degradation guidance.
  }
}
