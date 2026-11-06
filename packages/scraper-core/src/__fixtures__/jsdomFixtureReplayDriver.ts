/**
 * Loads synthetic HTML fixtures by URL for jsdom recipe replay tests.
 */

import type { IPageDriver, IGotoOptions, IWaitOptions, BrowserFn } from '../driver/IPageDriver';

export interface IJsdomFixtureReplayOptions {
  readonly fixtures: Readonly<Record<string, string>>;
  readonly initialUrl?: string;
}

export class JsdomFixtureReplayDriver implements IPageDriver {
  private _url: string;
  private readonly _fixtures: Readonly<Record<string, string>>;

  constructor(options: IJsdomFixtureReplayOptions) {
    this._fixtures = options.fixtures;
    this._url = options.initialUrl ?? 'about:blank';
    if (this._url !== 'about:blank') {
      this._writeDocument(this._fixtureHtml(this._url));
    }
  }

  async goto(url: string, _options?: IGotoOptions): Promise<void> {
    this._url = url;
    this._writeDocument(this._fixtureHtml(url));
  }

  private _writeDocument(html: string | undefined): void {
    if (html === undefined) {
      document.open();
      document.write('<!DOCTYPE html><html><body></body></html>');
      document.close();
      return;
    }
    const full = /<html[\s>]/i.test(html)
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>${html}</body></html>`;
    document.open();
    document.write(full);
    document.close();
  }

  url(): string {
    return this._url;
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    const out = fn(...args);
    return out instanceof Promise ? out : Promise.resolve(out);
  }

  async content(): Promise<string> {
    return document.documentElement.outerHTML;
  }

  async waitForLoad(_options?: IWaitOptions): Promise<void> {}

  async waitForUrlIncludes(_pattern: string, _options?: IWaitOptions): Promise<void> {}

  async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, Math.min(ms, 100)));
  }

  onNewPage(_handler: (page: IPageDriver) => Promise<void>): void {}

  private _fixtureHtml(url: string): string | undefined {
    if (this._fixtures[url]) return this._fixtures[url];
    let best: string | undefined;
    let bestLen = 0;
    for (const key of Object.keys(this._fixtures)) {
      if (url.startsWith(key) && key.length > bestLen) {
        best = this._fixtures[key];
        bestLen = key.length;
      }
    }
    return best;
  }
}
