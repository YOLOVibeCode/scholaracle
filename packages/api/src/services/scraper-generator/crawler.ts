/**
 * Scraper generation pipeline utilities.
 *
 * NOTE: The `crawlStep` and `authenticateCheckStep` functions that previously
 * launched a Playwright browser on the API server have been removed. Server-side
 * Chromium against school portals is no longer permitted. Scraper generation
 * based on live crawl is a local CLI concern only.
 *
 * The `connectStep` (HTTP HEAD reachability check) is retained as it makes no
 * authenticated request and opens no browser.
 */

export interface IConnectResult {
  readonly ok: boolean;
  readonly httpStatus?: number;
  readonly responseTimeMs?: number;
  readonly sslValid?: boolean;
  readonly error?: string;
}

export interface ILoginFormAnalysis {
  readonly emailField?: string;
  readonly passwordField?: string;
  readonly submitButton?: string;
  readonly ssoOptions?: string[];
  readonly formAction?: string;
  readonly method?: string;
}

export interface ICrawlResult {
  readonly ok: boolean;
  readonly title?: string;
  readonly loginForm?: ILoginFormAnalysis;
  readonly navigation?: Array<{ text: string; href: string }>;
  readonly detectedFramework?: string;
  readonly pageHtml?: string;
  readonly error?: string;
}

export interface IAuthenticateCheckResult {
  readonly ok: boolean;
  readonly loginFormUsable?: boolean;
  readonly captchaDetected?: boolean;
  readonly mfaRequired?: boolean;
  readonly loginMethod?: string;
  readonly ssoAvailable?: string[];
  readonly error?: string;
}

export interface IPageAnalysis {
  readonly url: string;
  readonly title: string;
  readonly loginForm: ILoginFormAnalysis;
  readonly navigation: Array<{ text: string; href: string }>;
  readonly detectedPlatform?: string;
  readonly detectedFramework?: string;
  readonly pageHtml?: string;
}

const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Step 1: Verify site is reachable (DNS + HTTP HEAD).
 * This is a plain HTTP request — no browser launched.
 */
export async function connectStep(loginUrl: string): Promise<IConnectResult> {
  const start = Date.now();
  try {
    const url = new URL(loginUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, error: 'URL must be http or https' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    const res = await fetch(loginUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'ScholaracleScraperGenerator/1.0' },
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    if (!res.ok && res.status >= 400) {
      return {
        ok: false,
        httpStatus: res.status,
        responseTimeMs,
        sslValid: true,
        error: `Site returned HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      httpStatus: res.status,
      responseTimeMs,
      sslValid: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const responseTimeMs = Date.now() - start;
    let error = msg;
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      error = 'Could not connect — check the URL and try again';
    } else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      error = 'Could not resolve host — check the URL';
    } else if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
      error = 'SSL certificate error — site may be insecure or misconfigured';
    } else if (msg.includes('abort')) {
      error = 'Connection timed out';
    }
    return {
      ok: false,
      responseTimeMs,
      error,
    };
  }
}

/**
 * Browser crawl is not available on the server.
 * Scraper generation via live page capture runs locally via the CLI.
 */
export async function crawlStep(_loginUrl: string): Promise<ICrawlResult> {
  return {
    ok: false,
    error:
      'Browser crawl is not available on the server. Use the local CLI to generate scrapers: `npx scholaracle-scraper generate --url <loginUrl>`.',
  };
}

/**
 * Browser auth check is not available on the server.
 */
export async function authenticateCheckStep(
  _loginUrl: string,
  _crawlResult: ICrawlResult
): Promise<IAuthenticateCheckResult> {
  return {
    ok: false,
    error: 'Browser crawl is not available on the server. Use the local CLI to generate scrapers.',
  };
}

/**
 * Full pipeline: connect → crawl → authenticate check.
 * Crawl and auth check are not available on the server.
 */
export async function runCrawlPipeline(loginUrl: string): Promise<IPageAnalysis> {
  const connect = await connectStep(loginUrl);
  if (!connect.ok) {
    throw new Error(connect.error ?? 'Could not connect to the site');
  }

  throw new Error(
    'Browser crawl is not available on the server. Use the local CLI to generate scrapers: `npx scholaracle-scraper generate --url <loginUrl>`.'
  );
}
