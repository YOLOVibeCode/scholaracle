/**
 * FakePageDriver — in-memory IPageDriver for recipe/orchestrator tests.
 *
 * Replays fixture HTML/JSON keyed by URL. No real browser, no network.
 * Implements IPageNavigator + IPageEvaluator + IPopupObserver (ISP slices).
 */

import type { IPageDriver, IGotoOptions, IWaitOptions, BrowserFn } from './IPageDriver';

/** Narrow navigator concern (ISP). */
export interface IPageNavigator {
  goto(url: string, options?: IGotoOptions): Promise<void>;
  url(): string;
  waitForLoad(options?: IWaitOptions): Promise<void>;
  waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** Narrow evaluator concern (ISP). */
export interface IPageEvaluator {
  evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult>;
  content(): Promise<string>;
}

/** Narrow popup-observer concern (ISP). */
export interface IPopupObserver {
  onNewPage(handler: (page: IPageDriver) => Promise<void>): void;
}

export interface IFakePageFixture {
  readonly html?: string;
  /** Values returned by evaluate() in call order for this URL. */
  readonly evaluateResults?: readonly unknown[];
}

export interface IFakePageDriverOptions {
  readonly fixtures?: Readonly<Record<string, IFakePageFixture>>;
  readonly initialUrl?: string;
}

/**
 * In-memory driver for unit tests. Fixtures are matched by exact URL or
 * by the longest prefix key that the current URL starts with.
 */
export class FakePageDriver implements IPageDriver, IPageNavigator, IPageEvaluator, IPopupObserver {
  private _url: string;
  private readonly _fixtures: Readonly<Record<string, IFakePageFixture>>;
  private readonly _evaluateQueues = new Map<string, unknown[]>();
  private _newPageHandler: ((page: IPageDriver) => Promise<void>) | null = null;
  readonly gotoHistory: string[] = [];
  readonly evaluateCallCount = { value: 0 };

  constructor(options: IFakePageDriverOptions = {}) {
    this._url = options.initialUrl ?? 'about:blank';
    this._fixtures = options.fixtures ?? {};
    for (const [key, fixture] of Object.entries(this._fixtures)) {
      if (fixture.evaluateResults) {
        this._evaluateQueues.set(key, [...fixture.evaluateResults]);
      }
    }
  }

  async goto(url: string, _options?: IGotoOptions): Promise<void> {
    this._url = url;
    this.gotoHistory.push(url);
  }

  url(): string {
    return this._url;
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    this.evaluateCallCount.value += 1;
    const fixtureKey = this._matchFixtureKey(this._url);
    const queue = fixtureKey ? this._evaluateQueues.get(fixtureKey) : undefined;
    if (queue && queue.length > 0) {
      return queue.shift() as TResult;
    }
    // Fall back to running the function in-process (for pure extractors with no DOM).
    try {
      return await fn(...args);
    } catch {
      throw new Error(`FakePageDriver: no evaluate fixture for URL "${this._url}" and fn threw`);
    }
  }

  async content(): Promise<string> {
    const fixture = this._fixtureFor(this._url);
    if (fixture?.html !== undefined) return fixture.html;
    return `<html><body data-url="${this._url}"></body></html>`;
  }

  async waitForLoad(_options?: IWaitOptions): Promise<void> {
    // Instant in fake driver
  }

  async waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void> {
    if (this._url.includes(pattern)) return;
    const timeout = options?.timeout ?? 1000;
    throw new Error(
      `FakePageDriver: URL "${this._url}" does not include "${pattern}" (timeout ${timeout}ms)`
    );
  }

  async sleep(_ms: number): Promise<void> {
    // No-op — tests should not wait real time
  }

  onNewPage(handler: (page: IPageDriver) => Promise<void>): void {
    this._newPageHandler = handler;
  }

  /** Test helper: simulate a popup/new-page event. */
  async simulateNewPage(page?: IPageDriver): Promise<void> {
    if (this._newPageHandler) {
      await this._newPageHandler(page ?? this);
    }
  }

  /** Test helper: enqueue evaluate results for a URL key. */
  enqueueEvaluateResults(urlKey: string, results: readonly unknown[]): void {
    const existing = this._evaluateQueues.get(urlKey) ?? [];
    this._evaluateQueues.set(urlKey, [...existing, ...results]);
  }

  private _fixtureFor(url: string): IFakePageFixture | undefined {
    const key = this._matchFixtureKey(url);
    return key ? this._fixtures[key] : undefined;
  }

  private _matchFixtureKey(url: string): string | undefined {
    if (this._fixtures[url]) return url;
    let best: string | undefined;
    for (const key of Object.keys(this._fixtures)) {
      if (url.startsWith(key) && (!best || key.length > best.length)) {
        best = key;
      }
    }
    return best;
  }
}
