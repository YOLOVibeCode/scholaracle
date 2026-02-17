/**
 * Server-side crawler for scraper generation.
 * Pipeline: connect (HTTP HEAD) → crawl (Playwright login page) → authenticate check (CAPTCHA/MFA detection).
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
const CRAWL_TIMEOUT_MS = 30_000;

/**
 * Step 1: Verify site is reachable (DNS + HTTP HEAD).
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
 * Step 2: Visit login page with Playwright, capture DOM and form structure.
 */
export async function crawlStep(loginUrl: string): Promise<ICrawlResult> {
  let browser: import('playwright').Browser | undefined;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'ScholaracleScraperGenerator/1.0',
      ignoreHTTPSErrors: false,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(CRAWL_TIMEOUT_MS);

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_TIMEOUT_MS });

    const analysis = await page.evaluate(() => {
      const result: {
        title: string;
        loginForm?: { emailField?: string; passwordField?: string; submitButton?: string; ssoOptions?: string[]; formAction?: string; method?: string };
        navigation: Array<{ text: string; href: string }>;
        detectedFramework?: string;
        pageHtml: string;
      } = {
        title: document.title || '',
        navigation: [],
        pageHtml: document.documentElement.outerHTML.slice(0, 50_000),
      };

      const forms = Array.from(document.querySelectorAll('form'));
      for (const form of forms) {
        const inputs = Array.from(form.querySelectorAll('input'));
        let hasPassword = false;
        let emailSelector = '';
        let passwordSelector = '';
        let submitSelector = '';
        const ssoOptions: string[] = [];

        for (const input of inputs) {
          const type = (input.getAttribute('type') || 'text').toLowerCase();
          const name = input.getAttribute('name') || input.id || '';
          const sel = input.id ? `#${input.id}` : name ? `input[name="${name}"]` : '';
          if (type === 'password') {
            hasPassword = true;
            passwordSelector = sel || `input[type="password"]`;
          } else if (type === 'email' || name.toLowerCase().includes('email') || name.toLowerCase().includes('user')) {
            emailSelector = sel || `input[type="email"]`;
          }
        }
        const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (submit) {
          submitSelector = submit.id ? `#${submit.id}` : submit.tagName.toLowerCase() + (submit.className ? '.' + String(submit.className).trim().split(/\s+/)[0] : '');
        }
        const links = Array.from(form.querySelectorAll('a[href]'));
        for (const a of links) {
          const text = (a.textContent || '').trim();
          if (/google|clever|microsoft|sso|sign in with|oauth/i.test(text)) {
            ssoOptions.push(text.slice(0, 50));
          }
        }
        if (hasPassword && (emailSelector || passwordSelector)) {
          result.loginForm = {
            emailField: emailSelector || 'input[type="email"], input[name="username"], input[name="email"]',
            passwordField: passwordSelector || 'input[type="password"]',
            submitButton: submitSelector || 'button[type="submit"], input[type="submit"]',
            ssoOptions: ssoOptions.length ? ssoOptions : undefined,
            formAction: (form.getAttribute('action') || '').slice(0, 500),
            method: (form.getAttribute('method') || 'get').toLowerCase(),
          };
          break;
        }
      }

      const navSelectors = ['nav a', 'header a', '[role="navigation"] a', '.nav a', '.menu a'];
      const seen = new Set<string>();
      for (const sel of navSelectors) {
        const links = Array.from(document.querySelectorAll(sel));
        for (const a of links) {
          const href = (a.getAttribute('href') || '').trim();
          const text = (a.textContent || '').trim().slice(0, 80);
          if (href && text && !seen.has(href)) {
            seen.add(href);
            result.navigation.push({ text, href });
          }
        }
      }

      if (document.querySelector('[data-reactroot], [data-reactid], #__next]')) result.detectedFramework = 'react';
      else if (document.querySelector('[ng-version], [ng-app]')) result.detectedFramework = 'angular';
      else if (document.querySelector('[data-v-]')) result.detectedFramework = 'vue';

      return result;
    });

    await browser.close();
    browser = undefined;

    if (!analysis.loginForm) {
      return {
        ok: false,
        title: analysis.title,
        navigation: analysis.navigation,
        detectedFramework: analysis.detectedFramework,
        error: 'Could not find a login form at this URL',
      };
    }

    return {
      ok: true,
      title: analysis.title,
      loginForm: analysis.loginForm,
      navigation: analysis.navigation,
      detectedFramework: analysis.detectedFramework,
      pageHtml: analysis.pageHtml,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg.includes('timeout') ? 'Page load timed out' : msg.slice(0, 300),
    };
  }
}

const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '[data-sitekey]',
  '.g-recaptcha',
  '#recaptcha',
  '[class*="captcha"]',
];
const MFA_SELECTORS = [
  'input[name*="code"]',
  'input[name*="otp"]',
  'input[name*="verification"]',
  '[class*="mfa"]',
  '[class*="two-factor"]',
  '[class*="2fa"]',
  'input[type="tel"][maxlength="6"]',
];

/**
 * Step 3: Verify login form is automatable (no CAPTCHA, no MFA blocking).
 */
export async function authenticateCheckStep(loginUrl: string, crawlResult: ICrawlResult): Promise<IAuthenticateCheckResult> {
  if (!crawlResult.ok || !crawlResult.loginForm) {
    return { ok: false, error: crawlResult.error ?? 'Crawl did not find a login form' };
  }
  let browser: import('playwright').Browser | undefined;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'ScholaracleScraperGenerator/1.0' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const check = await page.evaluate(({ captchaSel, mfaSel }: { captchaSel: string[]; mfaSel: string[] }) => {
      let captchaDetected = false;
      for (const sel of captchaSel) {
        if (document.querySelector(sel)) {
          captchaDetected = true;
          break;
        }
      }
      let mfaRequired = false;
      for (const sel of mfaSel) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          mfaRequired = true;
          break;
        }
      }
      return { captchaDetected, mfaRequired };
    }, { captchaSel: CAPTCHA_SELECTORS, mfaSel: MFA_SELECTORS });

    await browser.close();
    browser = undefined;

    if (check.captchaDetected) {
      return {
        ok: false,
        loginFormUsable: true,
        captchaDetected: true,
        mfaRequired: false,
        error: 'Login requires CAPTCHA — cannot be automated',
      };
    }
    if (check.mfaRequired) {
      return {
        ok: false,
        loginFormUsable: true,
        captchaDetected: false,
        mfaRequired: true,
        error: 'Login requires multi-factor authentication',
      };
    }

    return {
      ok: true,
      loginFormUsable: true,
      captchaDetected: false,
      mfaRequired: false,
      loginMethod: 'email_password',
      ssoAvailable: crawlResult.loginForm.ssoOptions,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Full pipeline: connect → crawl → authenticate check.
 * Returns page analysis for AI or throws with user-facing error.
 */
export async function runCrawlPipeline(loginUrl: string): Promise<IPageAnalysis> {
  const connect = await connectStep(loginUrl);
  if (!connect.ok) {
    throw new Error(connect.error ?? 'Could not connect to the site');
  }

  const crawl = await crawlStep(loginUrl);
  if (!crawl.ok) {
    throw new Error(crawl.error ?? 'Could not find a login form at this URL');
  }

  const auth = await authenticateCheckStep(loginUrl, crawl);
  if (!auth.ok) {
    throw new Error(auth.error ?? 'Login cannot be automated');
  }

  return {
    url: loginUrl,
    title: crawl.title ?? '',
    loginForm: crawl.loginForm!,
    navigation: crawl.navigation ?? [],
    detectedFramework: crawl.detectedFramework,
    pageHtml: crawl.pageHtml,
  };
}
