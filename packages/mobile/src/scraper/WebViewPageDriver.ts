/**
 * WebViewPageDriver — IPageDriver implementation for React Native WebView.
 *
 * Bridges between the scraper-core recipe (TypeScript) and the in-app WebView:
 *   - evaluate(): serializes a function to string, injects it via injectJavaScript,
 *     receives the result back via onMessage (postMessage bridge).
 *   - goto(): calls webviewRef.current.injectJavaScript to navigate.
 *   - content(): injects a script to return document.documentElement.outerHTML.
 *   - waitForLoad(): waits for the onLoadEnd event.
 *   - waitForUrlIncludes(): polls url() until the pattern matches.
 *   - onNewPage(): Skyward popups are intercepted and continued in the same WebView.
 *
 * Usage:
 *   const driver = new WebViewPageDriver();
 *   // Pass driver.webViewProps to the <WebView> component.
 *   // Call driver methods from the scraper recipe.
 */

import type { IPageDriver, IGotoOptions, IWaitOptions, BrowserFn } from '@scholaracle/scraper-core';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

const EVAL_TIMEOUT_MS = 30_000;
const EVAL_CHANNEL = '__slc_bridge__';

type PendingEval = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

interface IBridgeMessage {
  readonly channel: typeof EVAL_CHANNEL;
  readonly id: string;
  readonly type: 'result' | 'error';
  readonly value?: unknown;
  readonly message?: string;
}

/** Injectable shim — injects the postMessage bridge into the page. */
const BRIDGE_SHIM = `
(function() {
  if (window.__slc_eval_registered__) return;
  window.__slc_eval_registered__ = true;
  window.__slc_pending__ = {};
  window.__slc_eval__ = async function(id, fnStr, argsStr) {
    try {
      var args = JSON.parse(argsStr);
      var fn = eval('(' + fnStr + ')');
      var result = await fn.apply(null, Array.isArray(args) ? args : [args]);
      var msg = JSON.stringify({ channel: '${EVAL_CHANNEL}', id: id, type: 'result', value: result });
      window.ReactNativeWebView.postMessage(msg);
    } catch(e) {
      var err = JSON.stringify({ channel: '${EVAL_CHANNEL}', id: id, type: 'error', message: e && e.message || String(e) });
      window.ReactNativeWebView.postMessage(err);
    }
  };
})();
true;
`;

export class WebViewPageDriver implements IPageDriver {
  private _url = '';
  private _injectFn: ((js: string) => void) | null = null;
  private _pending = new Map<string, PendingEval>();
  private _loadResolvers: Array<() => void> = [];
  private _newPageHandlers: Array<(page: IPageDriver) => Promise<void>> = [];
  private _evalIdCounter = 0;

  /**
   * Attach the WebView's injectJavaScript function.
   * Call this once the WebView ref is available.
   */
  attachInject(fn: (js: string) => void): void {
    this._injectFn = fn;
  }

  /**
   * Props to spread onto the <WebView> component.
   * Connects the bridge event handlers.
   */
  get webViewHandlers(): {
    onMessage: (event: WebViewMessageEvent) => void;
    onLoadEnd: (event: WebViewNavigation) => void;
    onNavigationStateChange: (state: WebViewNavigation) => void;
  } {
    return {
      onMessage: this._handleMessage.bind(this),
      onLoadEnd: this._handleLoadEnd.bind(this),
      onNavigationStateChange: this._handleNavChange.bind(this),
    };
  }

  private _handleMessage(event: WebViewMessageEvent): void {
    let msg: IBridgeMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as IBridgeMessage;
    } catch {
      return;
    }
    if (msg.channel !== EVAL_CHANNEL) return;

    const pending = this._pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this._pending.delete(msg.id);

    if (msg.type === 'error') {
      pending.reject(new Error(msg.message ?? 'WebView eval error'));
    } else {
      pending.resolve(msg.value ?? null);
    }
  }

  private _handleLoadEnd(_event: WebViewNavigation): void {
    // Inject bridge shim on every page load
    this._inject(BRIDGE_SHIM);
    // Resolve any waiting waitForLoad() promises
    const resolvers = this._loadResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  private _handleNavChange(state: WebViewNavigation): void {
    this._url = state.url ?? this._url;
  }

  private _inject(js: string): void {
    if (this._injectFn) {
      this._injectFn(`${js}\ntrue;`);
    }
  }

  // ---------------------------------------------------------------------------
  // IPageDriver implementation
  // ---------------------------------------------------------------------------

  async goto(url: string, _options?: IGotoOptions): Promise<void> {
    this._inject(`window.location.href = ${JSON.stringify(url)};`);
    await this.waitForLoad({ timeout: _options?.timeout ?? 20000 });
  }

  url(): string {
    return this._url;
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    if (!this._injectFn) throw new Error('WebView not yet attached — call attachInject() first');

    const id = String(++this._evalIdCounter);
    const fnStr = fn.toString();
    const argsStr = JSON.stringify(args.length === 1 ? [args[0]] : args.length === 0 ? [] : args);

    return new Promise<TResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`WebView eval timed out after ${EVAL_TIMEOUT_MS}ms`));
      }, EVAL_TIMEOUT_MS);

      this._pending.set(id, {
        resolve: (v) => resolve(v as TResult),
        reject,
        timeoutId,
      });

      // Inject the evaluation call
      const escaped = JSON.stringify(fnStr);
      const escapedArgs = JSON.stringify(argsStr);
      this._inject(`window.__slc_eval__(${JSON.stringify(id)}, ${escaped}, ${escapedArgs});`);
    });
  }

  async content(): Promise<string> {
    return this.evaluate(() => document.documentElement.outerHTML);
  }

  async waitForLoad(options?: IWaitOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._loadResolvers.indexOf(resolve);
        if (idx > -1) this._loadResolvers.splice(idx, 1);
        reject(new Error(`waitForLoad timed out after ${options?.timeout ?? 15000}ms`));
      }, options?.timeout ?? 15000);

      this._loadResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void> {
    const deadline = Date.now() + (options?.timeout ?? 20000);
    while (!this._url.includes(pattern)) {
      if (Date.now() > deadline) {
        throw new Error(`waitForUrlIncludes('${pattern}') timed out`);
      }
      await this.sleep(300);
    }
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onNewPage(handler: (page: IPageDriver) => Promise<void>): void {
    this._newPageHandlers.push(handler);
  }

  /**
   * Call when a Skyward-style popup navigation is intercepted.
   * The handler receives `this` (the same driver, now on the popup URL).
   */
  async handlePopupNavigation(url: string): Promise<void> {
    this._inject(`window.location.href = ${JSON.stringify(url)};`);
    await this.waitForLoad({ timeout: 15000 });
    for (const h of this._newPageHandlers) {
      await h(this);
    }
  }
}
