/**
 * Runtime-agnostic page driver interface.
 *
 * Implemented by:
 *   - PlaywrightPageDriver  (CLI + server workers)
 *   - WebViewPageDriver     (React Native / Expo mobile app)
 *   - ExtensionPageDriver   (Chrome/Edge Manifest V3 extension)
 *
 * Recipes are written against this interface, so extraction logic is
 * identical across all three runtimes. Auth (login) is intentionally
 * NOT part of this interface — it is runtime-specific.
 */

/** Phase labels emitted during a scrape run. */
export type ScraperPhase =
  | 'initializing'
  | 'authenticating'
  | 'scraping'
  | 'transforming'
  | 'processing_assets'
  | 'completed'
  | 'failed'
  | 'cleanup';

export interface IScraperProgress {
  readonly phase: ScraperPhase;
  readonly message: string;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly detail?: Record<string, unknown>;
}

export type ScraperProgressCallback = (progress: IScraperProgress) => void;

export interface IGotoOptions {
  readonly waitUntil?: 'load' | 'networkidle';
  readonly timeout?: number;
}

export interface IWaitOptions {
  readonly timeout?: number;
}

/**
 * A function that runs inside the page's browser context.
 * Must only reference browser globals (document, fetch, etc.).
 * No closure over outer scope — all inputs must be passed as arguments.
 */
export type BrowserFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => TResult | Promise<TResult>;

/**
 * Core runtime-agnostic page abstraction.
 */
export interface IPageDriver {
  /** Navigate to a URL and wait for it to load. */
  goto(url: string, options?: IGotoOptions): Promise<void>;

  /** Return the current page URL. */
  url(): string;

  /**
   * Execute a function in the browser context.
   * The function must be self-contained (no closed-over scope).
   * Args are JSON-serializable.
   */
  evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult>;

  /** Get the full HTML of the current page. */
  content(): Promise<string>;

  /** Wait for the page to reach a load state. */
  waitForLoad(options?: IWaitOptions): Promise<void>;

  /** Wait for a URL pattern to match (simple string includes check). */
  waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void>;

  /** Pause execution for the given number of milliseconds. */
  sleep(ms: number): Promise<void>;

  /**
   * Register a handler for when a new page/tab/window is created.
   * Used by Skyward's popup-window auth pattern.
   * On mobile (single-WebView), the handler is invoked when a navigation
   * would open in a new window; the driver intercepts and continues in-frame.
   */
  onNewPage(handler: (page: IPageDriver) => Promise<void>): void;
}
