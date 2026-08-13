/**
 * Process-wide capture taps. Idempotent. Must never throw — a broken diag
 * module is worse than a silent one.
 *
 * Does NOT use the URL API — RN's polyfill is http-only and the constructor
 * never throws, making checks silently pass in Node tests while failing on
 * device. URL extraction uses plain string operations.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { log } from './store';

let installed = false;
let origFetch: typeof fetch | undefined;
let origWarn: typeof console.warn | undefined;
let origError: typeof console.error | undefined;
let origLog: typeof console.log | undefined;
let appSub: { remove: () => void } | null = null;
let errorsWrapped = false;

type ErrorHandler = (error: Error, isFatal?: boolean) => void;
type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler: () => ErrorHandler;
    setGlobalHandler: (h: ErrorHandler) => void;
  };
};

/** String-only URL extraction — the URL API is banned in this codebase. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: string }).url);
  }
  return String(input);
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && input !== null && 'method' in input) {
    return String((input as { method?: string }).method ?? 'GET').toUpperCase();
  }
  return 'GET';
}

async function previewBody(res: Response): Promise<string | undefined> {
  try {
    const ct = res.headers?.get?.('content-type') ?? '';
    if (ct && !ct.includes('json') && !ct.includes('text')) return undefined;
    const text = await res.clone().text();
    if (!text) return undefined;
    try {
      return JSON.stringify(JSON.parse(text)).slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return undefined;
  }
}

function wrapFetch(): void {
  origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (!origFetch) throw new Error('diag fetch wrapper missing original');
    const method = methodOf(input, init);
    const t0 = Date.now();
    try {
      const res = await origFetch(input, init);
      log('info', 'net', `${method} ${res.status} ${url}`, {
        status: res.status,
        ms: Date.now() - t0,
      });
      void previewBody(res).then((body) => {
        if (body) log('debug', 'net', `${method} body ${url}`, { body });
      });
      return res;
    } catch (err) {
      log('error', 'net', `${method} FAIL ${url}`, {
        ms: Date.now() - t0,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }) as typeof fetch;
}

function wrapConsole(): void {
  origWarn = console.warn.bind(console);
  origError = console.error.bind(console);
  // eslint-disable-next-line no-console
  origLog = console.log.bind(console);
  console.warn = (...args: unknown[]): void => {
    try {
      log('warn', 'console', args.map(String).join(' ').slice(0, 400));
    } catch {
      /* ignore */
    }
    origWarn?.(...args);
  };
  console.error = (...args: unknown[]): void => {
    try {
      log('error', 'console', args.map(String).join(' ').slice(0, 400));
    } catch {
      /* ignore */
    }
    origError?.(...args);
  };
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]): void => {
    try {
      log('debug', 'console', args.map(String).join(' ').slice(0, 400));
    } catch {
      /* ignore */
    }
    origLog?.(...args);
  };
}

function wrapErrors(): void {
  if (errorsWrapped) return;
  errorsWrapped = true;
  const g = globalThis as GlobalWithErrorUtils;
  if (g.ErrorUtils?.getGlobalHandler && g.ErrorUtils.setGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      log('error', 'err', error.message, {
        fatal: Boolean(isFatal),
        name: error.name,
        stack: error.stack?.slice(0, 400),
      });
      prev(error, isFatal);
    });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const tracking = require('promise/setimmediate/rejection-tracking') as {
      enable: (opts: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
      }) => void;
    };
    tracking.enable({
      allRejections: true,
      onUnhandled: (_id, error) => {
        const msg = error instanceof Error ? error.message : String(error);
        log('error', 'err', `unhandledRejection ${msg}`);
      },
    });
  } catch {
    /* not available outside RN promise polyfill */
  }
}

export function installDiagCapture(): void {
  if (installed) return;
  installed = true;
  try {
    wrapConsole();
  } catch {
    /* ignore */
  }
  try {
    wrapFetch();
  } catch {
    /* ignore */
  }
  try {
    wrapErrors();
  } catch {
    /* ignore */
  }
  try {
    appSub = AppState.addEventListener('change', (s: AppStateStatus) => {
      log('info', 'act', `appState:${s}`);
    });
  } catch {
    /* ignore */
  }
  log('info', 'act', 'capture:on');
}

export function uninstallDiagCaptureForTests(): void {
  if (!installed) return;
  if (origFetch) globalThis.fetch = origFetch;
  if (origWarn) console.warn = origWarn;
  if (origError) console.error = origError;
  // eslint-disable-next-line no-console
  if (origLog) console.log = origLog;
  appSub?.remove();
  appSub = null;
  installed = false;
  errorsWrapped = false;
}
