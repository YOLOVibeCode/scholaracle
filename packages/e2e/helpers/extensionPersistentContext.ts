/**
 * Inject the E2E extension conformance bundle (ContentScriptPageDriver + recipes).
 *
 * Playwright's bundled Chromium cannot load unpacked MV3 extensions (no service worker).
 * CI runs the same `dist/e2e-conformance.js` artifact via CDP init script — equivalent
 * to the extension content script under strict fake-portal CSP.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BrowserContext, Page } from '@playwright/test';
import { chromium } from '@playwright/test';

const EXTENSION_DIST = join(__dirname, '../../browser-extension/dist');
const CONFORMANCE_SCRIPT = join(EXTENSION_DIST, 'e2e-conformance.js');

export async function launchExtensionConformanceContext(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'slc-ext-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
  });
  const page = await context.newPage();
  await page.addInitScript({ path: CONFORMANCE_SCRIPT });
  return { context, page };
}
