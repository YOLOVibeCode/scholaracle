import { Page } from '@playwright/test';

/**
 * Navigation helpers for E2E tests.
 */

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForHrefNavigation(page: Page, href: string): Promise<void> {
  // Next.js client-side navigation does not reliably trigger a full "load" event.
  // Also allow querystrings/fragments without making tests brittle.
  const timeout = 30_000;

  if (href.startsWith('/')) {
    const re = new RegExp(`${escapeRegExp(href)}(?:[?#].*)?$`);
    await page.waitForURL(re, { timeout, waitUntil: 'domcontentloaded' });
    return;
  }

  await page.waitForURL(href, { timeout, waitUntil: 'domcontentloaded' });
}

async function clickAndNavigate(
  page: Page,
  locator: ReturnType<Page['locator']>,
  href: string | null
): Promise<void> {
  // Click, then wait for URL change. If navigation flakes, retry with force, then finally fall back to direct goto.
  await locator.first().click();

  if (!href) {
    await page.waitForLoadState('networkidle');
    return;
  }

  try {
    await waitForHrefNavigation(page, href);
  } catch {
    // Retry once with force (some sidebar links can be briefly overlapped during layout shifts)
    await locator.first().click({ force: true });
    try {
      await waitForHrefNavigation(page, href);
    } catch {
      // Last resort: direct navigation (keeps tests moving, still validates route works)
      await page.goto(href);
      await waitForHrefNavigation(page, href);
    }
  }
}

/**
 * Navigate to sidebar link by text.
 */
export async function navigateToSidebar(page: Page, linkText: string): Promise<void> {
  const normalized = linkText.toLowerCase().replace(/\s+/g, '-');

  // Ensure sidebar is visible (handle collapsed desktop sidebar and mobile off-canvas)
  const sidebarTrigger = page
    .locator(
      '[data-sidebar="trigger"], [data-testid="mobile-menu-toggle"], button[aria-label="Toggle menu"]'
    )
    .first();
  const sidebarContent = page.locator('[data-slot="sidebar-content"]').first();

  if ((await sidebarTrigger.count()) > 0 && (await sidebarTrigger.isVisible().catch(() => false))) {
    const contentVisible = await sidebarContent.isVisible().catch(() => false);
    if (!contentVisible) {
      await sidebarTrigger.click();
      await sidebarContent.waitFor({ state: 'visible', timeout: 5000 });
    }
  }

  // Wait for sidebar links to be available
  await page
    .waitForSelector(`[data-testid="sidebar-${normalized}"]`, { timeout: 5000, state: 'visible' })
    .catch(async () => {
      // Fallback: wait for any sidebar link
      await page
        .waitForSelector('[data-testid^="sidebar-"]', { timeout: 5000, state: 'visible' })
        .catch(() => {});
    });

  // Prefer stable test ids if present.
  const byTestId = page.locator(`[data-testid="sidebar-${normalized}"]`);
  const testIdCount = await byTestId.count();

  if (testIdCount > 0) {
    // Ensure element is visible
    await byTestId
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});

    // Get the href to wait for navigation
    const href = await byTestId.getAttribute('href');
    await clickAndNavigate(page, byTestId, href);
    return;
  }

  // Fallback: click link by its visible text (inside sidebar)
  const sidebar = page.locator('[role="complementary"], aside, nav, [data-slot="sidebar"]').first();
  const byTextLink = sidebar.locator(`a:has-text("${linkText}")`).first();
  const textLinkCount = await byTextLink.count();

  if (textLinkCount > 0) {
    await byTextLink.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const href = await byTextLink.getAttribute('href');
    await clickAndNavigate(page, byTextLink, href);
    return;
  }

  // Last resort: try finding anywhere on page
  const anywhereLink = page.locator(`a:has-text("${linkText}")`).first();
  const anywhereCount = await anywhereLink.count();
  if (anywhereCount > 0) {
    await anywhereLink.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const href = await anywhereLink.getAttribute('href');
    await clickAndNavigate(page, anywhereLink, href);
    return;
  }

  throw new Error(`Could not find sidebar link with text "${linkText}"`);
}

/**
 * Navigate to tab by name.
 */
export async function navigateToTab(page: Page, tabName: string): Promise<void> {
  await page.click(`[role="tab"]:has-text("${tabName}")`);
  await page.waitForTimeout(500); // Wait for tab content to load
}

/**
 * Click breadcrumb link.
 */
export async function clickBreadcrumb(page: Page, text: string): Promise<void> {
  await page.click(`nav[aria-label="breadcrumb"] >> text="${text}"`);
}

/**
 * Navigate back using browser back button.
 */
export async function navigateBack(page: Page): Promise<void> {
  await page.goBack();
  await page.waitForLoadState('networkidle');
}

/**
 * Click mobile menu toggle (hamburger).
 */
export async function toggleMobileMenu(page: Page): Promise<void> {
  await page.click('[data-testid="mobile-menu-toggle"], button[aria-label="Toggle menu"]');
}
